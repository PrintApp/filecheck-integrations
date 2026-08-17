import { describe, expect, it } from 'vitest';
import { call, connectHarness } from './helpers/mcp-client.js';
import { jobBody, makePreflightJob } from './helpers/mock-fetch.js';

describe('check_file', () => {
  it('submits sync, re-reads for signed URLs, and reports both axes', async () => {
    const job = makePreflightJob();
    const harness = await connectHarness([
      { status: 200, body: jobBody(job) }, // POST /jobs/preflight (sync)
      { status: 200, body: jobBody(job) }, // GET /jobs/{id} — signing re-read
    ]);

    const result = await call(harness.mcp, 'check_file', {
      source: { fileRef: 'upload_01jf8n2p3uvw8j2l4n6p8r0t2v' },
      profileId: 'profile_standard_cards',
      context: { artworkSize: { width_mm: 85, height_mm: 55 } },
    });

    expect(result.isError).toBe(false);
    expect(harness.requests).toHaveLength(2);
    const submitted = JSON.parse(harness.requests[0]!.body as string);
    expect(harness.requests[0]!.url).toContain('/jobs/preflight');
    expect(submitted.sync).toBe(true);
    expect(submitted.sources[0].profileId).toBe('profile_standard_cards');
    expect(submitted.context.artworkSize.width_mm).toBe(85);
    expect(harness.requests[1]!.method).toBe('GET');

    expect(result.structured.status).toBe('done');
    expect(result.structured.outcome).toBe('fail');
    expect(result.structured.verdict).toContain('NOT print-ready');
    expect(result.text).toContain('outcome: fail');

    const file = result.structured.files[0];
    expect(file.summary.fail).toBe(1);
    expect(file.findings).toHaveLength(3);
    expect(file.findings[0]).toMatchObject({
      ruleId: 'bleed_missing',
      severity: 'reject',
      autofixable: true,
    });
    expect(file.findings[0].locate).toBeUndefined();
    expect(file.recommendedAutofix.fixes).toContain('bleed_missing');

    const deliverable = result.structured.deliverables[0];
    expect(deliverable.downloadUrl).toContain('https://');
    expect(deliverable.bucket).toBeUndefined();
    expect(deliverable.key).toBeUndefined();
    await harness.close();
  });

  it('returns pending guidance without polling when waitSeconds is 0', async () => {
    const job = makePreflightJob({ status: 'pending', outcome: null });
    const harness = await connectHarness([{ status: 201, body: jobBody(job) }]);

    const result = await call(harness.mcp, 'check_file', {
      source: { url: 'https://example.com/file.pdf' },
      waitSeconds: 0,
    });

    expect(result.isError).toBe(false);
    expect(harness.requests).toHaveLength(1);
    const submitted = JSON.parse(harness.requests[0]!.body as string);
    expect(submitted.sync).toBeUndefined();
    expect(result.structured.pending).toBe(true);
    expect(result.structured.nextStep).toContain(job.id as string);
    expect(result.structured.nextStep).toContain('Do NOT submit the file again');
    await harness.close();
  });

  it('routes through POST /jobs when a ruleId is given', async () => {
    const job = makePreflightJob();
    const harness = await connectHarness([
      { status: 200, body: jobBody(job) },
      { status: 200, body: jobBody(job) },
    ]);

    const result = await call(harness.mcp, 'check_file', {
      source: { fileRef: 'upload_01jf8n2p3uvw8j2l4n6p8r0t2v' },
      ruleId: 'rule_business_cards',
    });

    expect(result.isError).toBe(false);
    expect(harness.requests[0]!.url).toMatch(/\/jobs$/);
    const submitted = JSON.parse(harness.requests[0]!.body as string);
    expect(submitted.ruleId).toBe('rule_business_cards');
    expect(submitted.sources[0].steps[0].type).toBe('preflight');
    await harness.close();
  });

  it('rejects a source with no locator before any request', async () => {
    const harness = await connectHarness([]);
    const result = await call(harness.mcp, 'check_file', { source: {} });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('exactly one of');
    expect(harness.requests).toHaveLength(0);
    await harness.close();
  });

  it('maps API errors to actionable messages', async () => {
    const cases = [
      { status: 402, body: '{"error":true,"message":"credit depleted"}', expect: 'billing' },
      { status: 401, body: '{"message":"Unauthorized"}', expect: 'Authentication failed' },
      {
        status: 403,
        body: '{"error":true,"message":"fileRef not owned by caller"}',
        expect: 're-upload',
      },
      {
        status: 400,
        body: '{"error":true,"message":"sources is required"}',
        expect: 'Invalid request',
      },
    ];
    for (const testCase of cases) {
      const harness = await connectHarness([{ status: testCase.status, body: testCase.body }]);
      const result = await call(harness.mcp, 'check_file', {
        source: { url: 'https://example.com/file.pdf' },
        waitSeconds: 0,
      });
      expect(result.isError).toBe(true);
      expect(result.text).toContain(testCase.expect);
      await harness.close();
    }
  });
});
