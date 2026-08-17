#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Filecheck } from 'filecheck-node';
import { LOCAL_CAPABILITIES } from './capabilities.js';
import { createFilecheckMcp } from './server.js';
import { VERSION } from './version.js';

// stdout is the MCP protocol channel — every diagnostic goes to stderr.

const key = process.env.FILECHECK_API_KEY;
if (!key) {
  process.stderr.write(
    [
      `filecheck-mcp v${VERSION}: FILECHECK_API_KEY is not set.`,
      '',
      'Set it to your secret API key (sk_…) from the Filecheck dashboard, e.g.:',
      '',
      '  claude mcp add filecheck -e FILECHECK_API_KEY=sk_... -- npx -y filecheck-mcp',
      '',
      'Docs: https://filecheck.io/docs/integrations/mcp',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

try {
  const client = new Filecheck(key, {
    baseUrl: process.env.FILECHECK_BASE_URL || undefined,
  });
  const server = createFilecheckMcp({ client, capabilities: LOCAL_CAPABILITIES });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`filecheck-mcp v${VERSION} ready (stdio)\n`);
} catch (error) {
  process.stderr.write(
    `filecheck-mcp failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
