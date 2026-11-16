import { describe, expect, it } from 'vitest';
import { Filecheck } from '../src/index.js';
import { createMockFetch } from './helpers/mock-fetch.js';

const SK = 'sk_0123456789abcdef0123456789abcdef';
const json = (status: number, body: unknown) => ({ status, body: JSON.stringify(body) });

const client = (...queue: ReturnType<typeof json>[]) => {
  const { mockFetch, requests } = createMockFetch(...queue);
  return { fc: new Filecheck(SK, { fetch: mockFetch, maxRetries: 0 }), requests };
};

describe('setup resources', () => {
  it('accepts an OAuth access token (fat_) as the credential', async () => {
    const { mockFetch, requests } = createMockFetch(json(200, { settings: {} }));
    const fc = new Filecheck('fat_abcdefghijklmnopqrstuvwxyz0123456789', { fetch: mockFetch });
    await fc.settings.retrieve();
    expect(requests[0]!.headers.authorization).toBe(
      'Bearer fat_abcdefghijklmnopqrstuvwxyz0123456789',
    );
  });

  it('lists catalog drafts only when asked', async () => {
    const { fc, requests } = client(
      json(200, { rules: [{ id: 'rule_1' }] }),
      json(200, { rules: [] }),
    );
    expect(await fc.rules.list({ drafts: true })).toEqual([{ id: 'rule_1' }]);
    await fc.rules.list();
    expect(requests[0]!.url).toBe('https://api.filecheck.io/rules?drafts=true');
    expect(requests[1]!.url).toBe('https://api.filecheck.io/rules');
  });

  it('creates a draft, patches, publishes and reverts catalog records', async () => {
    const { fc, requests } = client(
      json(201, { profile: { id: 'pf_1', draft: true } }),
      json(200, { profile: { id: 'pf_1' }, dryRun: true }),
      json(200, { workflow: { id: 'wf_1' }, published: ['rule_1', 'wf_1'] }),
      json(200, { preset: { id: 'opt_1', source: 'store' }, reverted: true }),
      json(200, { connector: { id: 'cn_1', deleted: true } }),
    );
    expect(await fc.profiles.create({ title: 'Cards' }, { draft: true })).toEqual({
      record: { id: 'pf_1', draft: true },
    });
    expect(await fc.profiles.update('pf_1', { title: null }, { dryRun: true })).toEqual({
      record: { id: 'pf_1' },
      dryRun: true,
    });
    expect(await fc.workflows.publish('wf_1')).toEqual({
      record: { id: 'wf_1' },
      published: ['rule_1', 'wf_1'],
    });
    expect((await fc.optimizePresets.revert('opt_1')).reverted).toBe(true);
    expect(await fc.connectors.del('cn_1')).toEqual({ id: 'cn_1', deleted: true });

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'POST https://api.filecheck.io/profiles?draft=true',
      'PATCH https://api.filecheck.io/profiles/pf_1?dryRun=true',
      'POST https://api.filecheck.io/workflows/wf_1/publish',
      'POST https://api.filecheck.io/optimize-presets/opt_1/revert',
      'DELETE https://api.filecheck.io/connectors/cn_1',
    ]);
    expect(JSON.parse(requests[1]!.body as string)).toEqual({ title: null });
  });

  it('maps products, searches the store and updates settings', async () => {
    const { fc, requests } = client(
      json(200, { productMap: { productId: '42', workflowId: 'wf_1' } }),
      json(200, { products: [{ id: '42' }], hasMore: true, nextCursor: 'c2' }),
      json(200, { settings: { presentation: 'inline' } }),
      json(200, { productMap: { productId: '42', deleted: true } }),
    );
    expect((await fc.productMaps.set('42', { workflowId: 'wf_1' })).record.workflowId).toBe('wf_1');
    expect(await fc.products.search({ search: 'cards' })).toEqual({
      products: [{ id: '42' }],
      hasMore: true,
      nextCursor: 'c2',
    });
    expect((await fc.settings.update({ presentation: 'inline' })).record).toEqual({
      presentation: 'inline',
    });
    expect((await fc.productMaps.del('42')).deleted).toBe(true);
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'PUT https://api.filecheck.io/product-maps/42',
      'GET https://api.filecheck.io/products?search=cards',
      'PATCH https://api.filecheck.io/settings',
      'DELETE https://api.filecheck.io/product-maps/42',
    ]);
  });

  it('tests destinations and webhooks, and lists webhook events', async () => {
    const { fc, requests } = client(
      json(200, { test: { ok: true, detail: 'sftp://…' } }),
      json(200, { events: [{ type: 'job.completed' }] }),
      json(200, { test: { ok: false, status: 500, error: 'boom' } }),
    );
    expect((await fc.destinations.test('dst_1')).ok).toBe(true);
    expect(await fc.webhookEndpoints.events()).toEqual([{ type: 'job.completed' }]);
    expect((await fc.webhookEndpoints.test('wh_1')).ok).toBe(false);
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'POST https://api.filecheck.io/destinations/dst_1/test',
      'GET https://api.filecheck.io/webhook-events',
      'POST https://api.filecheck.io/webhooks/wh_1/test',
    ]);
  });
});
