import { describe, expect, it } from 'vitest';
import { call, connectHarness } from './helpers/mcp-client.js';
import { jobBody, makePreflightJob } from './helpers/mock-fetch.js';

// A gang sheet with no density header can be read either way round (4000×6000
// px: 6000 across at 273 dpi, or 4000 across at 182 dpi). The API settles it
// from context.sheet.across, the customer's answer. The MCP's context schema
// stripped unknown keys, so an agent had no way to pass that answer on.
describe('context.sheet.across', () => {
  for (const tool of ['check_file', 'fix_file'] as const) {
    it(`${tool} forwards the customer's answer`, async () => {
      const job = makePreflightJob();
      const harness = await connectHarness([
        { status: 200, body: jobBody(job) },
        { status: 200, body: jobBody(job) },
      ]);
      const result = await call(harness.mcp, tool, {
        source: { fileRef: 'upload_01jf8n2p3uvw8j2l4n6p8r0t2v' },
        profileId: 'profile_dtf',
        context: { sheet: { across: 'short' } },
      });
      expect(result.isError).toBe(false);
      const submitted = JSON.parse(harness.requests[0]!.body as string);
      expect(submitted.context).toEqual({ sheet: { across: 'short' } });
      await harness.close();
    });
  }

  it('refuses anything but short or long', async () => {
    const harness = await connectHarness([]);
    const result = await call(harness.mcp, 'check_file', {
      source: { fileRef: 'upload_01jf8n2p3uvw8j2l4n6p8r0t2v' },
      context: { sheet: { across: 'width' } },
    });
    expect(result.isError).toBe(true);
    expect(harness.requests).toHaveLength(0);
    await harness.close();
  });
});
