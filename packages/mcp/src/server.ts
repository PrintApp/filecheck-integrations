import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Filecheck } from 'filecheck-node';
import type { Capabilities, ToolContext } from './capabilities.js';
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
1. The product: find_store_products (Shopify) or ask for its id; list_product_maps shows what is mapped already.
2. What exists: list_catalog workflows, rules and profiles. Prefer a built-in (source:'store') one that fits: manage_catalog update on it saves the account's own copy (revert undoes it).
3. Before writing a record, read its schema with setup_reference. manage_catalog create saves drafts by default; build bottom-up: profile → rule (its accept entries name the profiles) → workflow (intake.ruleId, delivery.destinationIds). dryRun: true validates without saving.
4. Try the draft on a real file: check_file with workflowId (or ruleId). Fix what the result shows.
5. Ask before anything customers see: manage_catalog publish (the workflow publishes the drafts it points at), then map_product set, and update_settings.
Delivery: manage_destination create, then test_destination — it really writes a sample file into the shop's hotfolder or sends mail, so ask first. Secrets read back as ********.
Setup errors name the field at fault (param) and list every problem (details): fix those and retry.`;

export interface CreateFilecheckMcpOptions {
  /** A configured filecheck-node client (carries the API key). */
  client: Filecheck;
  /** What the hosting process can do; shapes which tools and fields exist. */
  capabilities: Capabilities;
}

/**
 * Build the Filecheck MCP server. Transport-agnostic: the stdio CLI and the
 * remote Streamable HTTP Lambda both consume this factory.
 */
export function createFilecheckMcp({ client, capabilities }: CreateFilecheckMcpOptions): McpServer {
  const server = new McpServer(
    { name: 'filecheck', version: VERSION },
    { instructions: INSTRUCTIONS },
  );
  const ctx: ToolContext = { client, caps: capabilities };

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
