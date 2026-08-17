import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Filecheck } from 'filecheck-node';
import type { FetchLike } from 'filecheck-node';
import type { Capabilities } from '../../src/capabilities.js';
import { LOCAL_CAPABILITIES } from '../../src/capabilities.js';
import { createFilecheckMcp } from '../../src/server.js';
import type { QueuedResponse } from './mock-fetch.js';
import { createMockFetch } from './mock-fetch.js';

export interface ConnectedHarness {
  mcp: Client;
  requests: ReturnType<typeof createMockFetch>['requests'];
  push: (response: QueuedResponse) => void;
  close: () => Promise<void>;
}

/**
 * Wire a real MCP client to the server over an in-memory transport, with the
 * Filecheck API stubbed by a response queue. Every tool test goes through
 * genuine `tools/call` round-trips.
 */
export async function connectHarness(
  queue: QueuedResponse[] = [],
  caps: Capabilities = LOCAL_CAPABILITIES,
): Promise<ConnectedHarness> {
  const { mockFetch, requests, push } = createMockFetch(...queue);
  const client = new Filecheck('sk_test_mcp', { fetch: mockFetch as FetchLike, maxRetries: 0 });
  const server = createFilecheckMcp({ client, capabilities: caps });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: 'harness', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
  return {
    mcp,
    requests,
    push,
    close: async () => {
      await mcp.close();
      await server.close();
    },
  };
}

export interface CallOutcome {
  isError: boolean;
  text: string;
  structured: Record<string, any>;
}

export async function call(
  mcp: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<CallOutcome> {
  const result = (await mcp.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: Record<string, any>;
  };
  const text = (result.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n');
  return { isError: result.isError === true, text, structured: result.structuredContent ?? {} };
}
