import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LibraryItem } from 'filecheck-node';
import { z } from 'zod';
import type { ToolContext } from '../capabilities.js';
import { jsonResult, toolErrorResult } from '../format.js';

const CATALOG_TYPES = ['profiles', 'rules', 'workflows', 'connectors', 'optimize-presets'] as const;
type CatalogType = (typeof CATALOG_TYPES)[number];

/** Listing keeps only the identifying scalars; retrieve returns the full item. */
function compactItem(item: LibraryItem): Record<string, unknown> {
  const out: Record<string, unknown> = { id: item.id };
  for (const key of ['title', 'name', 'kind', 'description', 'enabled', 'source']) {
    const value = item[key];
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) out[key] = value;
  }
  return out;
}

export function registerListCatalog(server: McpServer, { client }: ToolContext): void {
  const resources: Record<
    CatalogType,
    { list(): Promise<LibraryItem[]>; retrieve(id: string): Promise<LibraryItem> }
  > = {
    profiles: client.profiles,
    rules: client.rules,
    workflows: client.workflows,
    connectors: client.connectors,
    'optimize-presets': client.optimizePresets,
  };

  server.registerTool(
    'list_catalog',
    {
      title: 'Browse the resource catalog',
      description:
        "Browse the tenant's resource catalog: preflight `profiles` (check-sets for check_file/fix_file), intake `rules`, `workflows`, `connectors`, and `optimize-presets` (params objects for optimize_file). " +
        "Profiles carry a `kind` ('pdf' or 'raster') — pick a profile whose kind matches the file being checked, or most checks come back not-applicable. " +
        "Entries tagged source:'domain' are the tenant's own; source:'store' are Filecheck built-ins. Pass `id` for the full definition of one entry.",
      inputSchema: {
        type: z.enum(CATALOG_TYPES).describe('Which collection to browse.'),
        id: z.string().optional().describe('Fetch one entry in full instead of listing.'),
      },
      outputSchema: {
        type: z.string(),
        items: z
          .array(z.object({}).passthrough())
          .optional()
          .describe('Compact listing (no id given).'),
        item: z.object({}).passthrough().optional().describe('Full entry (id given).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const resource = resources[args.type];
        if (args.id) {
          const item = await resource.retrieve(args.id);
          return jsonResult({ type: args.type, item }, `${args.type} entry ${args.id}.`);
        }
        const items = (await resource.list()).map(compactItem);
        const kindCounts = new Map<string, number>();
        for (const item of items) {
          if (typeof item.kind === 'string')
            kindCounts.set(item.kind, (kindCounts.get(item.kind) ?? 0) + 1);
        }
        const byKind = kindCounts.size
          ? ` (${[...kindCounts].map(([kind, count]) => `${count} ${kind}`).join(', ')})`
          : '';
        const kindHint =
          args.type === 'profiles' && kindCounts.size
            ? " Pick a profile whose kind matches the file's type (pdf vs raster)."
            : '';
        return jsonResult(
          { type: args.type, items },
          `${items.length} ${args.type} entr${items.length === 1 ? 'y' : 'ies'}${byKind}.${kindHint} Pass an id for the full definition.`,
        );
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );
}
