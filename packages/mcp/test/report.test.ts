import { describe, expect, it } from 'vitest';
import { call, connectHarness } from './helpers/mcp-client.js';
import { jobBody, makePreflightJob } from './helpers/mock-fetch.js';

const job = () => makePreflightJob();

describe('get_report', () => {
  it('returns a section overview when no section is requested', async () => {
    const harness = await connectHarness([{ status: 200, body: jobBody(job()) }]);
    const result = await call(harness.mcp, 'get_report', { jobId: 'job_x' });
    expect(result.isError).toBe(false);
    const keys = result.structured.sections.map((s: { key: string }) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['pages', 'fonts', 'images', 'evaluation']));
    const fonts = result.structured.sections.find((s: { key: string }) => s.key === 'fonts');
    expect(fonts).toMatchObject({ kind: 'array', count: 2 });
    await harness.close();
  });

  it('paginates array sections', async () => {
    const harness = await connectHarness([{ status: 200, body: jobBody(job()) }]);
    const result = await call(harness.mcp, 'get_report', {
      jobId: 'job_x',
      section: 'fonts',
      offset: 1,
      limit: 1,
    });
    expect(result.structured).toMatchObject({ total: 2, offset: 1, returned: 1 });
    expect(result.structured.data[0].name).toBe('Inter-Regular');
    await harness.close();
  });

  it('filters evaluation findings by severity', async () => {
    const harness = await connectHarness([{ status: 200, body: jobBody(job()) }]);
    const result = await call(harness.mcp, 'get_report', { jobId: 'job_x', severity: 'warn' });
    expect(result.structured.total).toBe(2);
    expect(result.structured.data.every((f: { severity: string }) => f.severity === 'warn')).toBe(
      true,
    );
    await harness.close();
  });

  it('lists available sections on a bad section name', async () => {
    const harness = await connectHarness([{ status: 200, body: jobBody(job()) }]);
    const result = await call(harness.mcp, 'get_report', { jobId: 'job_x', section: 'nope' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Available:');
    await harness.close();
  });

  it('explains when there are no preflight results yet', async () => {
    const pending = makePreflightJob({ status: 'running', outcome: null, results: {} });
    const harness = await connectHarness([{ status: 200, body: jobBody(pending) }]);
    const result = await call(harness.mcp, 'get_report', { jobId: 'job_x' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('no preflight results');
    await harness.close();
  });
});
