import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LibraryResource, WriteResult } from 'filecheck-node';
import { z } from 'zod';
import { READ, READ_WEB, WRITE, WRITE_WEB } from '../annotations.js';
import type { ToolContext } from '../capabilities.js';
import { jsonResult, toolErrorResult } from '../format.js';
import { SCHEMA_TYPES, schemaReference } from '../schema-reference.js';

/**
 * The setup tools: everything that decides what happens to a customer's
 * files — workflows, rules, profiles, connectors, optimize presets, delivery
 * destinations, which product opens which workflow, the storefront Element's
 * settings, webhooks. Each is a thin call to the public API, which validates
 * (errors name the field at fault and list every problem), scopes everything
 * to the caller's account, and keeps agent-made records as drafts until
 * published.
 *
 * Record bodies are free-form here: the API's JSON schemas are far too large
 * to inline (profile ≈130 KB), so setup_reference serves them on demand.
 */

class ToolInputError extends Error {}

function need(args: Record<string, unknown>, keys: string[], action: string): void {
  const missing = keys.filter((key) => args[key] === undefined || args[key] === '');
  if (missing.length) throw new ToolInputError(`${action} needs ${missing.join(', ')}.`);
}

const failed = (error: unknown) =>
  toolErrorResult(error instanceof ToolInputError ? new Error(error.message) : error);

const record = z
  .record(z.unknown())
  .optional()
  .describe(
    'The record. On create: the whole record. On update: a JSON Merge Patch (RFC 7396) — only what changes; null removes a key; arrays replace the whole list. Read its schema with setup_reference first.',
  );
const dryRun = z
  .boolean()
  .optional()
  .describe(
    'Validate and check references without saving: the result shows the record as it would be saved.',
  );

const CATALOG = {
  workflow: { resource: 'workflows', name: 'workflow' },
  rule: { resource: 'rules', name: 'rule' },
  profile: { resource: 'profiles', name: 'preflight profile' },
  connector: { resource: 'connectors', name: 'connector' },
  'optimize-preset': { resource: 'optimizePresets', name: 'optimize preset' },
} as const;
type CatalogType = keyof typeof CATALOG;
const CATALOG_TYPES = Object.keys(CATALOG) as [CatalogType, ...CatalogType[]];

/** A write's result as structured content: the record plus what the API said about it. */
function written(base: Record<string, unknown>, result: WriteResult<unknown>) {
  const { record: saved, ...rest } = result;
  return {
    ...base,
    record: saved as Record<string, unknown>,
    ...(rest as Record<string, unknown>),
  };
}

const idOf = (value: unknown): string | undefined =>
  value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'
    ? (value as { id: string }).id
    : undefined;

/** Destination params that are credentials (write-only; read back as ********). */
const DESTINATION_SECRETS = ['password', 'privateKey', 'passphrase', 'headerValue'];
const MASK = '********';

/** Secret params set to a real value (the mask keeps the stored one, so it is fine). */
function secretsIn(record: Record<string, unknown> | undefined): string[] {
  const params = record?.params;
  if (!params || typeof params !== 'object') return [];
  return DESTINATION_SECRETS.filter((key) => {
    const value = (params as Record<string, unknown>)[key];
    return value !== undefined && value !== null && value !== MASK;
  });
}

export function registerSetupTools(server: McpServer, { client, caps }: ToolContext): void {
  const destinationSecretsNote = caps.credentialArgs
    ? 'Secrets (passwords, private keys, header values) are write-only: send them only when setting or changing them.'
    : 'Passwords, private keys and header values are never sent through this tool: create the destination without them, then the merchant adds them in the Filecheck dashboard (Library → Destinations). Never ask for them in the chat.';

  // ---- schemas ------------------------------------------------------------

  server.registerTool(
    'setup_reference',
    {
      title: 'Read a setup record schema',
      description:
        'The JSON Schema of a setup record (workflow, rule, profile, connector, optimize-preset, destination, product-map, settings, webhook): every field, what it means, its allowed values. ' +
        'Read it before creating or patching a record. Small nodes come back whole; large ones (a whole profile) as an overview listing each property and the `path`s to read next — pass one as `path` (a JSON pointer such as /properties/intake or #/definitions/acceptEntry; $ref values work as paths too).',
      inputSchema: {
        type: z.enum(SCHEMA_TYPES).describe('Which record.'),
        path: z
          .string()
          .optional()
          .describe('JSON pointer into the schema. Omit for the top level.'),
      },
      annotations: { title: 'Read a setup record schema', ...READ },
    },
    async (args) => {
      try {
        const ref = schemaReference(args.type, args.path ?? '');
        if (!ref) {
          throw new ToolInputError(
            `No node at ${args.path} in the ${args.type} schema. Omit path for the top level, then follow its readNext paths.`,
          );
        }
        return jsonResult(
          { ...ref },
          ref.complete
            ? `${args.type} schema at ${ref.path}.`
            : `${args.type} schema at ${ref.path} (overview: pass one of readNext as path for more).`,
        );
      } catch (error) {
        return failed(error);
      }
    },
  );

  // ---- the catalog: workflows, rules, profiles, connectors, presets --------

  const catalog = (type: CatalogType): LibraryResource => client[CATALOG[type].resource];

  server.registerTool(
    'manage_catalog',
    {
      title: 'Create or change workflows, rules, profiles…',
      description:
        "Create, update (merge patch), delete, publish or revert a workflow, rule, preflight profile, connector or optimize preset. Read the record's schema with setup_reference first; list_catalog shows what exists. " +
        'create saves a draft by default (draft: true): hidden from the storefront and dashboard until published, yet jobs run against it by id, so try it on a real file with check_file (workflowId or ruleId) first. Build bottom-up: profile → rule (accept entries name profiles) → workflow (intake.ruleId, delivery.destinationIds). ' +
        "publish makes a draft live, with the drafts it points at; ask the merchant first. update on a built-in (source:'store') record saves the account's own copy under the same id; revert drops that copy. delete is refused (in_use) while a published record or product uses it.",
      inputSchema: {
        type: z.enum(CATALOG_TYPES).describe('Which kind of record.'),
        action: z.enum(['create', 'update', 'delete', 'publish', 'revert']),
        id: z.string().optional().describe('The record id (all actions but create).'),
        record,
        draft: z
          .boolean()
          .optional()
          .describe(
            'create only. Default true: save as a draft. false publishes at once — only when the merchant asked for that.',
          ),
        dryRun,
      },
      annotations: { title: 'Create or change workflows, rules, profiles…', ...WRITE },
    },
    async (args) => {
      try {
        const resource = catalog(args.type);
        const name = CATALOG[args.type].name;
        const base = { type: args.type, action: args.action };
        switch (args.action) {
          case 'create': {
            need(args, ['record'], 'create');
            const draft = args.draft ?? true;
            const result = await resource.create(args.record!, { draft, dryRun: args.dryRun });
            const id = idOf(result.record);
            return jsonResult(
              written(base, result),
              result.dryRun
                ? `The ${name} is valid (dry run: nothing saved).`
                : draft
                  ? `Created draft ${name} ${id}. Try it on a real file (check_file with ${args.type === 'workflow' ? 'workflowId' : args.type === 'rule' ? 'ruleId' : 'a draft rule or workflow that uses it'}), then publish it when the merchant agrees.`
                  : `Created ${name} ${id} (published).`,
            );
          }
          case 'update': {
            need(args, ['id', 'record'], 'update');
            const result = await resource.update(args.id!, args.record!, { dryRun: args.dryRun });
            return jsonResult(
              written(base, result),
              result.dryRun
                ? `The patch to ${name} ${args.id} is valid (dry run: nothing saved).`
                : `Updated ${name} ${args.id}.`,
            );
          }
          case 'delete': {
            need(args, ['id'], 'delete');
            const deleted = await resource.del(args.id!);
            return jsonResult({ ...base, record: deleted }, `Deleted ${name} ${args.id}.`);
          }
          case 'publish': {
            need(args, ['id'], 'publish');
            const result = await resource.publish(args.id!);
            return jsonResult(
              written(base, result),
              `Published ${result.published.join(', ')}. It is live now.`,
            );
          }
          case 'revert': {
            need(args, ['id'], 'revert');
            const result = await resource.revert(args.id!);
            return jsonResult(
              written(base, result),
              result.reverted
                ? `Reverted ${name} ${args.id}: the built-in version applies again.`
                : `${name} ${args.id} had no copy of the account's own: nothing to revert.`,
            );
          }
        }
      } catch (error) {
        return failed(error);
      }
    },
  );

  // ---- destinations -------------------------------------------------------

  server.registerTool(
    'list_destinations',
    {
      title: 'List delivery destinations',
      description:
        'Where finished files are delivered: SFTP/FTP hotfolders, S3, webhooks, email. Workflows list the destinations they deliver to (delivery.destinationIds). Secrets read as ********. Pass id for one destination.',
      inputSchema: { id: z.string().optional().describe('One destination in full.') },
      annotations: { title: 'List delivery destinations', ...READ },
    },
    async (args) => {
      try {
        if (args.id) {
          const destination = await client.destinations.retrieve(args.id);
          return jsonResult({ destination }, `Destination ${args.id}.`);
        }
        const destinations = await client.destinations.list();
        return jsonResult({ destinations }, `${destinations.length} destination(s).`);
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'manage_destination',
    {
      title: 'Create or change a delivery destination',
      description: `Create, update (merge patch) or delete a delivery destination. Read setup_reference destination first: \`kind\` picks the transport and \`params\` its settings. ${destinationSecretsNote} After creating, test_destination checks the connection. delete is refused (in_use) while a published workflow delivers to it.`,
      inputSchema: {
        action: z.enum(['create', 'update', 'delete']),
        id: z.string().optional().describe('The destination id (update, delete).'),
        record,
        dryRun,
      },
      annotations: { title: 'Create or change a delivery destination', ...WRITE },
    },
    async (args) => {
      try {
        const base = { action: args.action };
        const secrets = caps.credentialArgs ? [] : secretsIn(args.record);
        if (secrets.length) {
          throw new ToolInputError(
            `This connection doesn't take passwords, private keys or header values (${secrets.map((k) => `params.${k}`).join(', ')}). Save the destination without them, then the merchant adds them in the Filecheck dashboard under Library → Destinations. Don't ask for them in the chat.`,
          );
        }
        if (args.action === 'create') {
          need(args, ['record'], 'create');
          const result = await client.destinations.create(args.record!, { dryRun: args.dryRun });
          return jsonResult(
            written(base, result),
            result.dryRun
              ? 'The destination is valid (dry run: nothing saved).'
              : `Created destination ${idOf(result.record)}. test_destination checks it delivers.`,
          );
        }
        if (args.action === 'update') {
          need(args, ['id', 'record'], 'update');
          const result = await client.destinations.update(args.id!, args.record!, {
            dryRun: args.dryRun,
          });
          return jsonResult(
            written(base, result),
            result.dryRun ? 'The patch is valid (dry run).' : `Updated destination ${args.id}.`,
          );
        }
        need(args, ['id'], 'delete');
        const deleted = await client.destinations.del(args.id!);
        return jsonResult({ ...base, record: deleted }, `Deleted destination ${args.id}.`);
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'test_destination',
    {
      title: 'Send a test delivery',
      description:
        "Delivers a sample order (TEST-1001, a one-page Sample_Product.pdf) through the destination's real transport and reports whether it got through. SFTP, FTP and S3 really write the file where a print workflow watching that folder may pick it up, and email really sends: ask the merchant before running it.",
      inputSchema: { id: z.string().describe('The destination id.') },
      annotations: { title: 'Send a test delivery', ...WRITE_WEB },
    },
    async (args) => {
      try {
        const test = await client.destinations.test(args.id);
        return jsonResult(
          { id: args.id, test },
          test.ok
            ? `Test delivery to ${args.id} got through.`
            : `Test delivery to ${args.id} failed: ${String(test.error ?? 'see test')}.`,
        );
      } catch (error) {
        return failed(error);
      }
    },
  );

  // ---- products -----------------------------------------------------------

  server.registerTool(
    'list_product_maps',
    {
      title: 'List product mappings',
      description:
        "Every product in the merchant's Shopify store that opens a workflow, and which. The storefront Element runs that workflow on the product page.",
      inputSchema: {},
      annotations: { title: 'List product mappings', ...READ },
    },
    async () => {
      try {
        const productMaps = await client.productMaps.list();
        return jsonResult({ productMaps }, `${productMaps.length} mapped product(s).`);
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'find_store_products',
    {
      title: "Find the store's products",
      description:
        "Reads products from the merchant's connected Shopify store, each with the workflow it is mapped to. Other carts answer cart_not_supported: on WooCommerce, PrestaShop and OpenCart the merchant picks a product's workflow in the Filecheck plugin's product settings, so tell them which workflow to pick there instead of mapping it.",
      inputSchema: {
        search: z
          .string()
          .optional()
          .describe('Words in the product title. Omit for the most recent.'),
        cursor: z.string().optional().describe('nextCursor from the previous page.'),
      },
      annotations: { title: "Find the store's products", ...READ_WEB },
    },
    async (args) => {
      try {
        const page = await client.products.search({ search: args.search, cursor: args.cursor });
        return jsonResult(
          { ...page },
          `${page.products.length} product(s)${page.hasMore ? ' (more: pass nextCursor as cursor)' : ''}.`,
        );
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'map_product',
    {
      title: 'Map a product to a workflow',
      description:
        "Shopify stores only: on WooCommerce, PrestaShop and OpenCart the merchant picks a product's workflow in the Filecheck plugin's product settings, and a mapping has no effect there, so tell the merchant which workflow to pick instead. set: the product opens this workflow on its page from now on (customers see it at once: ask first). The workflow must be published. remove: the product stops opening a workflow. Read setup_reference product-map for the record's other fields.",
      inputSchema: {
        action: z.enum(['set', 'remove']),
        productId: z.string().describe("The product's id in the store (Shopify: the numeric id)."),
        workflowId: z.string().optional().describe('set: the published workflow (wf_…).'),
        record: z
          .record(z.unknown())
          .optional()
          .describe(
            'set: other product-map fields (title, url, variants), merged with workflowId.',
          ),
        dryRun,
      },
      annotations: { title: 'Map a product to a workflow', ...WRITE },
    },
    async (args) => {
      try {
        if (args.action === 'remove') {
          const removed = await client.productMaps.del(args.productId);
          return jsonResult(
            { action: 'remove', record: removed },
            `Product ${args.productId} no longer opens a workflow.`,
          );
        }
        const map = {
          ...(args.record ?? {}),
          ...(args.workflowId !== undefined && { workflowId: args.workflowId }),
        };
        if (map.workflowId === undefined) throw new ToolInputError('set needs workflowId.');
        const result = await client.productMaps.set(args.productId, map, { dryRun: args.dryRun });
        return jsonResult(
          written({ action: 'set' }, result),
          result.dryRun
            ? 'The mapping is valid (dry run: nothing saved).'
            : `Product ${args.productId} now opens workflow ${String(map.workflowId)}.`,
        );
      } catch (error) {
        return failed(error);
      }
    },
  );

  // ---- settings -----------------------------------------------------------

  server.registerTool(
    'get_settings',
    {
      title: 'Get the storefront settings',
      description:
        'How the Filecheck Element appears on product pages: where it mounts, the add-to-cart button it guards, display mode, theme, proof display.',
      inputSchema: {},
      annotations: { title: 'Get the storefront settings', ...READ },
    },
    async () => {
      try {
        const settings = await client.settings.retrieve();
        return jsonResult({ settings }, 'Storefront settings.');
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'update_settings',
    {
      title: 'Change the storefront settings',
      description:
        'Patch the storefront settings: send only what changes; null puts a setting back to its default. Read setup_reference settings for the fields. Changes show on the live store at once: ask first. Custom JS and CSS are dashboard-only.',
      inputSchema: {
        patch: z.record(z.unknown()).describe('The settings that change.'),
        dryRun,
      },
      annotations: { title: 'Change the storefront settings', ...WRITE },
    },
    async (args) => {
      try {
        const result = await client.settings.update(args.patch, { dryRun: args.dryRun });
        return jsonResult(
          written({}, result),
          result.dryRun ? 'The patch is valid (dry run).' : 'Storefront settings updated.',
        );
      } catch (error) {
        return failed(error);
      }
    },
  );

  // ---- webhooks -----------------------------------------------------------

  server.registerTool(
    'list_webhooks',
    {
      title: 'List webhooks',
      description:
        "The account's webhook endpoints (HTTP callbacks for job, proof, account and billing events, signed with X-FileCheck-Signature), and the event types they can subscribe to. Pass id for one webhook.",
      inputSchema: { id: z.string().optional().describe('One webhook in full.') },
      annotations: { title: 'List webhooks', ...READ },
    },
    async (args) => {
      try {
        if (args.id) {
          const webhook = await client.webhookEndpoints.retrieve(args.id);
          return jsonResult({ webhook }, `Webhook ${args.id}.`);
        }
        const [webhooks, events] = await Promise.all([
          client.webhookEndpoints.list(),
          client.webhookEndpoints.events(),
        ]);
        return jsonResult(
          { webhooks, events },
          `${webhooks.length} webhook(s); ${events.length} event type(s) available.`,
        );
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'manage_webhook',
    {
      title: 'Create or change a webhook',
      description:
        'Create, update (merge patch) or delete a webhook endpoint: { url, events, headers?, description? }. Event types come from list_webhooks. Header values are write-only.',
      inputSchema: {
        action: z.enum(['create', 'update', 'delete']),
        id: z.string().optional().describe('The webhook id (update, delete).'),
        record,
        dryRun,
      },
      annotations: { title: 'Create or change a webhook', ...WRITE },
    },
    async (args) => {
      try {
        const base = { action: args.action };
        if (args.action === 'create') {
          need(args, ['record'], 'create');
          const result = await client.webhookEndpoints.create(args.record!, {
            dryRun: args.dryRun,
          });
          return jsonResult(
            written(base, result),
            result.dryRun
              ? 'The webhook is valid (dry run).'
              : `Created webhook ${idOf(result.record)}. test_webhook sends it a test event.`,
          );
        }
        if (args.action === 'update') {
          need(args, ['id', 'record'], 'update');
          const result = await client.webhookEndpoints.update(args.id!, args.record!, {
            dryRun: args.dryRun,
          });
          return jsonResult(
            written(base, result),
            result.dryRun ? 'The patch is valid (dry run).' : `Updated webhook ${args.id}.`,
          );
        }
        need(args, ['id'], 'delete');
        const deleted = await client.webhookEndpoints.del(args.id!);
        return jsonResult({ ...base, record: deleted }, `Deleted webhook ${args.id}.`);
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'test_webhook',
    {
      title: 'Send a test webhook event',
      description:
        "Sends a signed test event to the webhook's URL and reports the receiver's answer.",
      inputSchema: { id: z.string().describe('The webhook id.') },
      annotations: { title: 'Send a test webhook event', ...WRITE_WEB },
    },
    async (args) => {
      try {
        const test = await client.webhookEndpoints.test(args.id);
        return jsonResult(
          { id: args.id, test },
          test.ok
            ? `The receiver accepted the test event${test.status ? ` (${String(test.status)})` : ''}.`
            : `The test event failed: ${String(test.error ?? test.status ?? 'see test')}.`,
        );
      } catch (error) {
        return failed(error);
      }
    },
  );
}
