import { describe, expect, it } from 'vitest';
import { FULL_LIMIT, SCHEMAS } from '../src/schema-reference.js';
import { call, connectHarness } from './helpers/mcp-client.js';

const ok = (body: unknown, status = 200) => ({ status, body: JSON.stringify(body) });

describe('setup_reference', () => {
  it('returns an overview of a large schema, with paths to read next', async () => {
    const harness = await connectHarness();
    const result = await call(harness.mcp, 'setup_reference', { type: 'profile' });
    expect(result.isError).toBe(false);
    expect(result.structured.complete).toBe(false);
    expect(result.structured.schema.title).toBe((SCHEMAS.profile as any).title);
    expect(Object.keys(result.structured.schema.properties)).toEqual(
      Object.keys((SCHEMAS.profile as any).properties),
    );
    expect(result.structured.schema.readNext).toContain('/properties/<name>');
    expect(JSON.stringify(result.structured).length).toBeLessThan(40_000);
    await harness.close();
  });

  it('returns small schemas and nodes whole, and follows $ref-style pointers', async () => {
    const harness = await connectHarness();
    const webhook = await call(harness.mcp, 'setup_reference', { type: 'webhook' });
    expect(webhook.structured.complete).toBe(true);
    expect(webhook.structured.schema).toEqual(SCHEMAS.webhook);

    const name = Object.keys((SCHEMAS.rule as any).definitions)[0]!;
    const def = await call(harness.mcp, 'setup_reference', {
      type: 'rule',
      path: `#/definitions/${name}`,
    });
    expect(def.isError).toBe(false);
    expect(def.structured.path).toBe(`/definitions/${name}`);
    if (JSON.stringify((SCHEMAS.rule as any).definitions[name]).length <= FULL_LIMIT) {
      expect(def.structured.schema).toEqual((SCHEMAS.rule as any).definitions[name]);
    }
    await harness.close();
  });

  it('says how to recover from a path that does not exist', async () => {
    const harness = await connectHarness();
    const result = await call(harness.mcp, 'setup_reference', {
      type: 'workflow',
      path: '/properties/nope',
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('readNext');
    await harness.close();
  });
});

describe('manage_catalog', () => {
  it('creates drafts by default and says how to try them', async () => {
    const harness = await connectHarness([ok({ workflow: { id: 'wf_1', draft: true } }, 201)]);
    const result = await call(harness.mcp, 'manage_catalog', {
      type: 'workflow',
      action: 'create',
      record: { title: 'Business cards', intake: { ruleId: 'rule_1' } },
    });
    expect(result.isError).toBe(false);
    expect(harness.requests[0]!.method).toBe('POST');
    expect(harness.requests[0]!.url).toContain('/workflows?draft=true');
    expect(JSON.parse(harness.requests[0]!.body as string).title).toBe('Business cards');
    expect(result.structured.record).toEqual({ id: 'wf_1', draft: true });
    expect(result.text).toContain('draft workflow wf_1');
    expect(result.text).toContain('workflowId');
    await harness.close();
  });

  it('publishes on draft: false only when asked', async () => {
    const harness = await connectHarness([ok({ profile: { id: 'pf_1' } }, 201)]);
    await call(harness.mcp, 'manage_catalog', {
      type: 'profile',
      action: 'create',
      record: { title: 'x' },
      draft: false,
    });
    expect(harness.requests[0]!.url).not.toContain('draft=');
    await harness.close();
  });

  it('patches, publishes and maps optimize presets to their envelope', async () => {
    const harness = await connectHarness([
      ok({ preset: { id: 'opt_1', customized: true } }),
      ok({ workflow: { id: 'wf_1' }, published: ['pf_1', 'rule_1', 'wf_1'] }),
    ]);
    const patched = await call(harness.mcp, 'manage_catalog', {
      type: 'optimize-preset',
      action: 'update',
      id: 'opt_1',
      record: { params: { pdf: { imageQuality: 80 } } },
    });
    expect(harness.requests[0]!.method).toBe('PATCH');
    expect(harness.requests[0]!.url).toContain('/optimize-presets/opt_1');
    expect(patched.structured.record.customized).toBe(true);

    const published = await call(harness.mcp, 'manage_catalog', {
      type: 'workflow',
      action: 'publish',
      id: 'wf_1',
    });
    expect(harness.requests[1]!.url).toContain('/workflows/wf_1/publish');
    expect(published.structured.published).toEqual(['pf_1', 'rule_1', 'wf_1']);
    expect(published.text).toContain('pf_1, rule_1, wf_1');
    await harness.close();
  });

  it('refuses an action without what it needs, before calling the API', async () => {
    const harness = await connectHarness();
    const result = await call(harness.mcp, 'manage_catalog', { type: 'rule', action: 'update' });
    expect(result.isError).toBe(true);
    expect(result.text).toBe('update needs id, record.');
    expect(harness.requests).toHaveLength(0);
    await harness.close();
  });

  it("surfaces the API's validation problems so the agent can fix them", async () => {
    const harness = await connectHarness([
      ok(
        {
          error: true,
          code: 'invalid_request',
          message: 'accept[0].profileId must be a string (and 1 more)',
          param: 'accept[0].profileId',
          details: [
            { path: '/accept/0/profileId', message: 'must be a string' },
            { path: '/title', message: 'is required' },
          ],
        },
        400,
      ),
    ]);
    const result = await call(harness.mcp, 'manage_catalog', {
      type: 'rule',
      action: 'create',
      record: { accept: [{ profileId: 1 }] },
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('field: accept[0].profileId');
    expect(result.text).toContain('/title');
    await harness.close();
  });
});

describe('products, destinations, settings, webhooks', () => {
  it('map_product set needs a workflow; remove unmaps', async () => {
    const harness = await connectHarness([
      ok({ productMap: { productId: '42', workflowId: 'wf_1' } }),
      ok({ productMap: { productId: '42', deleted: true } }),
    ]);
    const missing = await call(harness.mcp, 'map_product', { action: 'set', productId: '42' });
    expect(missing.isError).toBe(true);

    const set = await call(harness.mcp, 'map_product', {
      action: 'set',
      productId: '42',
      workflowId: 'wf_1',
    });
    expect(harness.requests[0]!.method).toBe('PUT');
    expect(JSON.parse(harness.requests[0]!.body as string)).toEqual({ workflowId: 'wf_1' });
    expect(set.text).toContain('now opens workflow wf_1');

    await call(harness.mcp, 'map_product', { action: 'remove', productId: '42' });
    expect(harness.requests[1]!.method).toBe('DELETE');
    await harness.close();
  });

  it('find_store_products pages the store', async () => {
    const harness = await connectHarness([
      ok({ products: [{ id: '42', title: 'Cards' }], hasMore: true, nextCursor: 'c2' }),
    ]);
    const result = await call(harness.mcp, 'find_store_products', { search: 'cards' });
    expect(harness.requests[0]!.url).toContain('/products?search=cards');
    expect(result.text).toContain('pass nextCursor');
    await harness.close();
  });

  it('test_destination reports a failed delivery as a result, not an error', async () => {
    const harness = await connectHarness([
      ok({ test: { ok: false, error: 'connection refused' } }),
    ]);
    const result = await call(harness.mcp, 'test_destination', { id: 'dst_1' });
    expect(result.isError).toBe(false);
    expect(result.text).toContain('connection refused');
    await harness.close();
  });

  it('update_settings patches; list_webhooks includes the event types', async () => {
    const harness = await connectHarness([
      ok({ settings: { presentation: 'modal' }, dryRun: true }),
      ok({ webhooks: [{ id: 'wh_1' }] }),
      ok({ events: [{ type: 'job.completed' }, { type: 'proof.approved' }] }),
    ]);
    const settings = await call(harness.mcp, 'update_settings', {
      patch: { presentation: 'modal' },
      dryRun: true,
    });
    expect(harness.requests[0]!.url).toContain('/settings?dryRun=true');
    expect(settings.structured.dryRun).toBe(true);

    const hooks = await call(harness.mcp, 'list_webhooks', {});
    expect(hooks.structured.events).toHaveLength(2);
    await harness.close();
  });
});

describe('check_file with a workflow', () => {
  it("runs the file through the workflow's intake (drafts included)", async () => {
    const job = { id: 'job_1', status: 'done', outcome: 'pass', tasks: [], results: {} };
    const harness = await connectHarness([ok({ job }, 201), ok({ job })]);
    await call(harness.mcp, 'check_file', {
      source: { url: 'https://example.com/card.pdf' },
      workflowId: 'wf_draft',
      ruleId: 'rule_ignored',
    });
    const body = JSON.parse(harness.requests[0]!.body as string);
    expect(harness.requests[0]!.url).toMatch(/\/jobs$/);
    expect(body.workflowId).toBe('wf_draft');
    expect(body.ruleId).toBeUndefined();
    expect(body.sources[0].steps).toBeDefined();
    await harness.close();
  });
});
