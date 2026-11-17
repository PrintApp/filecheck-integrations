import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Filecheck } from 'filecheck-node';
import type { Capabilities, LinkRewriter, ToolContext } from './capabilities.js';
import { registerSaveArtifact } from './tools/artifact.js';
import { registerListCatalog } from './tools/catalog.js';
import { registerCheckFile } from './tools/check.js';
import { registerFixFile } from './tools/fix.js';
import { registerJobTools } from './tools/jobs.js';
import { registerOptimizeFile } from './tools/optimize.js';
import { registerRenderPreviews } from './tools/previews.js';
import { registerGetReport } from './tools/report.js';
import { registerSetupTools } from './tools/setup.js';
import { registerValidatePdf } from './tools/validate.js';
import { VERSION } from './version.js';

const INSTRUCTIONS = `Filecheck checks print files (PDF, images) for print-readiness, fixes what it can automatically, validates PDF/A / PDF/UA conformance, optimizes, and renders previews.

CRITICAL — every job has two independent axes:
- status = execution lifecycle: pending | running | done | skipped | error
- outcome = verdict: pass | warn | fail | fixed | unchanged | na | mixed
status:done + outcome:fail means the check ran successfully AND the file is NOT print-ready. Never report success from status alone.

Download URLs are presigned and expire after ~60 minutes; get_job re-mints them on every call — never store or cache URLs.
If a tool returns pending:true, poll get_job with the returned jobId. Never resubmit a file that is already processing.
Typical flow: check_file → (findings autofixable?) fix_file → download/save deliverables. Discover profiles and rules with list_catalog.

Setting up a product (which files it accepts, how they are checked and fixed, where finished files go) — check in with the merchant at each step, in plain words:
1. The product: find_store_products and list_product_maps (Shopify). On WooCommerce, PrestaShop and OpenCart the merchant picks a product's workflow in the Filecheck plugin's product settings: there, skip mapping and tell them the workflow's name. A connector is chosen per product in those plugin settings too, never on a workflow.
2. What exists: list_catalog workflows, rules and profiles. Prefer a built-in (source:'store') one that fits: manage_catalog update on it saves the account's own copy (revert undoes it).
3. Before writing a record, read its schema with setup_reference. manage_catalog create saves drafts by default; build bottom-up: profile → rule (its accept entries name the profiles) → workflow (intake.ruleId, delivery.destinationIds). dryRun: true validates without saving.
4. Try the draft on a real file: check_file with workflowId (or ruleId). Fix what the result shows.
5. Ask before anything customers see: manage_catalog publish (the workflow publishes the drafts it points at), then map_product set (Shopify), and update_settings.
Delivery: manage_destination create, then test_destination — it really writes a sample file into the shop's hotfolder or sends mail, so ask first. Secrets read back as ********. Never ask for passwords, private keys or tokens in the chat: the merchant adds them in the Filecheck dashboard (Library → Destinations).
Setup errors name the field at fault (param) and list every problem (details): fix those and retry.`;

export interface CreateFilecheckMcpOptions {
  /** A configured filecheck-node client (carries the API key). */
  client: Filecheck;
  /** What the hosting process can do; shapes which tools and fields exist. */
  capabilities: Capabilities;
  /** Optional: rewrite download links in results (the hosted server's short links). */
  links?: LinkRewriter;
}

/**
 * Build the Filecheck MCP server. Transport-agnostic: the stdio CLI and the
 * remote Streamable HTTP Lambda both consume this factory.
 */
export function createFilecheckMcp({
  client,
  capabilities,
  links,
}: CreateFilecheckMcpOptions): McpServer {
  const server = new McpServer(
    {
      name: 'filecheck',
      title: 'Filecheck',
      version: VERSION,
      websiteUrl: 'https://filecheck.io',
      // The Filecheck mark, served on the remote server's own host (fc-oauth).
      icons: [
        { src: 'https://api.filecheck.io/favicon.svg', mimeType: 'image/svg+xml', sizes: ['any'] },
        { src: 'https://api.filecheck.io/icon.png', mimeType: 'image/png', sizes: ['512x512'] },
      ],
    },
    { instructions: INSTRUCTIONS },
  );
  const ctx: ToolContext = { client, caps: capabilities, ...(links ? { links } : {}) };

  registerCheckFile(server, ctx);
  registerFixFile(server, ctx);
  registerValidatePdf(server, ctx);
  registerOptimizeFile(server, ctx);
  registerRenderPreviews(server, ctx);
  registerJobTools(server, ctx);
  registerListCatalog(server, ctx);
  registerGetReport(server, ctx);
  registerSetupTools(server, ctx);
  if (capabilities.localFiles) registerSaveArtifact(server, ctx);

  return server;
}
