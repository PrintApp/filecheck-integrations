import { describe, expect, it } from 'vitest';
import { call, connectHarness } from './helpers/mcp-client.js';
import { fixture, jobBody, makePreflightJob } from './helpers/mock-fetch.js';

describe('get_job', () => {
  it('returns a formatted terminal job with fresh URLs', async () => {
    const job = makePreflightJob();
    const harness = await connectHarness([{ status: 200, body: jobBody(job) }]);
    const result = await call(harness.mcp, 'get_job', { jobId: job.id as string });
    expect(result.isError).toBe(false);
    expect(harness.requests[0]!.method).toBe('GET');
    expect(harness.requests[0]!.url).toContain(`/jobs/${job.id}`);
    expect(result.structured.outcome).toBe('fail');
    expect(result.structured.deliverables[0].downloadUrl).toBeTruthy();
    await harness.close();
  });

  it('reports pending jobs with polling guidance', async () => {
    const job = makePreflightJob({ status: 'running', outcome: null });
    const harness = await connectHarness([{ status: 200, body: jobBody(job) }]);
    const result = await call(harness.mcp, 'get_job', { jobId: job.id as string });
    expect(result.structured.pending).toBe(true);
    expect(result.structured.nextStep).toContain('get_job');
    await harness.close();
  });

  it('maps a 404 to a not-found message', async () => {
    const harness = await connectHarness([
      { status: 404, body: '{"error":true,"message":"job not found"}' },
    ]);
    const result = await call(harness.mcp, 'get_job', { jobId: 'job_missing' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Not found');
    await harness.close();
  });
});

describe('list_jobs', () => {
  it('returns lean rows and the pagination cursor', async () => {
    const harness = await connectHarness([{ status: 200, body: fixture('jobs.list.json') }]);
    const result = await call(harness.mcp, 'list_jobs', { limit: 2 });
    expect(result.isError).toBe(false);
    expect(result.structured.jobs).toHaveLength(2);
    expect(result.structured.jobs[0]).toHaveProperty('jobId');
    expect(result.structured.jobs[0]).toHaveProperty('status');
    expect(result.structured.jobs[0]).toHaveProperty('outcome');
    expect(result.structured.nextKey).toBeTruthy();
    expect(harness.requests[0]!.url).toContain('limit=2');
    await harness.close();
  });
});

describe('delete_job', () => {
  it('soft-deletes and confirms', async () => {
    const harness = await connectHarness([
      { status: 200, body: '{"id":"job_del1","taskIds":["task_a"]}' },
    ]);
    const result = await call(harness.mcp, 'delete_job', { jobId: 'job_del1' });
    expect(result.isError).toBe(false);
    expect(harness.requests[0]!.method).toBe('DELETE');
    expect(result.structured).toEqual({ deleted: true, jobId: 'job_del1', taskIds: ['task_a'] });
    await harness.close();
  });
});
