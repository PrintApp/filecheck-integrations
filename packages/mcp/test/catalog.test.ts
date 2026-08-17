import { describe, expect, it } from 'vitest';
import { call, connectHarness } from './helpers/mcp-client.js';

const PROFILE = {
  id: 'profile_standard_cards',
  title: 'Standard cards',
  kind: 'pdf',
  enabled: true,
  source: 'store',
  sections: { geometry: { rules: [{ id: 'bleed_missing', severity: 'reject' }] } },
};

describe('list_catalog', () => {
  it('lists compact entries without nested definitions', async () => {
    const harness = await connectHarness([
      { status: 200, body: JSON.stringify({ profiles: [PROFILE] }) },
    ]);
    const result = await call(harness.mcp, 'list_catalog', { type: 'profiles' });
    expect(result.isError).toBe(false);
    expect(harness.requests[0]!.url).toContain('/profiles');
    expect(result.structured.items).toEqual([
      {
        id: 'profile_standard_cards',
        title: 'Standard cards',
        kind: 'pdf',
        enabled: true,
        source: 'store',
      },
    ]);
    await harness.close();
  });

  it('returns the full entry when an id is given', async () => {
    const harness = await connectHarness([
      { status: 200, body: JSON.stringify({ profile: PROFILE }) },
    ]);
    const result = await call(harness.mcp, 'list_catalog', {
      type: 'profiles',
      id: 'profile_standard_cards',
    });
    expect(result.structured.item.sections).toBeDefined();
    await harness.close();
  });

  it('maps optimize-presets to its endpoint and envelope', async () => {
    const harness = await connectHarness([
      { status: 200, body: JSON.stringify({ presets: [{ id: 'optmz_web', title: 'Web' }] }) },
    ]);
    const result = await call(harness.mcp, 'list_catalog', { type: 'optimize-presets' });
    expect(harness.requests[0]!.url).toContain('/optimize-presets');
    expect(result.structured.items).toHaveLength(1);
    await harness.close();
  });
});
