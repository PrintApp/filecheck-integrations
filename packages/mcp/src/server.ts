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
import { registerValidatePdf } from './tools/validate.js';
import { VERSION } from './version.js';

const INSTRUCTIONS = `Filecheck checks print files (PDF, images) for print-readiness, fixes what it can automatically, validates PDF/A / PDF/UA conformance, optimizes, and renders previews.

CRITICAL — every job has two independent axes:
- status = execution lifecycle: pending | running | done | skipped | error
- outcome = verdict: pass | warn | fail | fixed | unchanged | na | mixed
status:done + outcome:fail means the check ran successfully AND the file is NOT print-ready. Never report success from status alone.

Download URLs are presigned and expire after ~60 minutes; get_job re-mints them on every call — never store or cache URLs.
If a tool returns pending:true, poll get_job with the returned jobId. Never resubmit a file that is already processing.
Typical flow: check_file → (findings autofixable?) fix_file → download/save deliverables. Discover profiles and rules with list_catalog.`;

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
  if (capabilities.localFiles) registerSaveArtifact(server, ctx);

  return server;
}
