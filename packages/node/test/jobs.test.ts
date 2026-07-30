import { describe, expect, it } from 'vitest';
import { Filecheck } from '../src/index.js';
import { createMockFetch, fixture, fixtureJson, makeJob } from './helpers/mock-fetch.js';

const SK = 'sk_0123456789abcdef0123456789abcdef';

function client(...responses: Parameters<typeof createMockFetch>) {
  const mock = createMockFetch(...responses);
  return { fc: new Filecheck(SK, { fetch: mock.mockFetch, maxRetries: 0 }), ...mock };
}

function body(req: { body?: string | FormData }): Record<string, unknown> {
  return JSON.parse(req.body as string);
}

describe('jobs.create / submit variants', () => {
  it('async create (default): 201 lean → pending true, no sync flag sent', async () => {
    const { fc, requests } = client({ status: 201, body: fixture('job.lean.json') });
    const result = await fc.jobs.create({
      sources: [{ url: 'https://x.example/a.pdf', steps: [{ type: 'preflight' }] }],
    });

    expect(requests[0]!.url).toBe('https://api.filecheck.io/jobs');
    expect(body(requests[0]!)).not.toHaveProperty('sync');
    expect(body(requests[0]!)).not.toHaveProperty('wait');
    expect(result.pending).toBe(true);
    expect(result.job.status).toBe('pending');
  });

  it('wait:true create: sends sync:true; 200 full → pending false', async () => {
    const { fc, requests } = client({ status: 200, body: fixture('job.full.json') });
    const result = await fc.jobs.create({
      sources: [{ url: 'https://x.example/a.pdf', steps: [{ type: 'preflight' }] }],
      wait: true,
    });

    expect(body(requests[0]!)).toMatchObject({ sync: true });
    expect(result.pending).toBe(false);
    expect(result.job.summary?.policy?.onFail).toBe('reject');
    expect(result.job.results?.validate?.[0]?.compliant).toBe(true);
  });

  it('202 + wait: continues polling client-side until terminal', async () => {
    const { fc, requests } = client(
      { status: 202, body: fixture('job.pending-202.json') },
      { status: 200, body: JSON.stringify({ job: makeJob({ status: 'running' }) }) },
      { status: 200, body: fixture('job.full.json') },
    );
    const result = await fc.jobs.create({
      sources: [{ url: 'https://x.example/a.pdf', steps: [{ type: 'preflight' }] }],
      wait: true,
      waitTimeoutMs: 30_000,
    });

    expect(requests).toHaveLength(3);
    expect(requests[1]!.method).toBe('GET');
    expect(result.pending).toBe(false);
    expect(result.job.status).toBe('done');
  });

  it('202 + waitTimeoutMs:0 returns pending:true without polling', async () => {
    const { fc, requests } = client({ status: 202, body: fixture('job.pending-202.json') });
    const result = await fc.jobs.create({
      sources: [{ url: 'https://x.example/a.pdf', steps: [{ type: 'preflight' }] }],
      wait: true,
      waitTimeoutMs: 0,
    });
    expect(requests).toHaveLength(1);
    expect(result.pending).toBe(true);
  });

  it('validate defaults to wait (no async flag); wait:false sends async:true', async () => {
    const first = client({ status: 200, body: fixture('job.full.json') });
    await first.fc.jobs.validate({ sources: [{ fileRef: 'upload_1', profile: ['1b'] }] });
    expect(body(first.requests[0]!)).not.toHaveProperty('async');
    expect(first.requests[0]!.url).toBe('https://api.filecheck.io/jobs/validate');

    const second = client({ status: 201, body: fixture('job.lean.json') });
    await second.fc.jobs.validate({ sources: [{ fileRef: 'upload_1' }], wait: false });
    expect(body(second.requests[0]!)).toMatchObject({ async: true });
  });

  it('optimize defaults to wait; fix/preflight/previews default to async', async () => {
    const opt = client({ status: 200, body: fixture('job.full.json') });
    await opt.fc.jobs.optimize({ sources: [{ fileRef: 'upload_1', params: { pdf: {} } }] });
    expect(body(opt.requests[0]!)).not.toHaveProperty('async');

    for (const method of ['fix', 'preflight', 'previews'] as const) {
      const { fc, requests } = client({ status: 201, body: fixture('job.lean.json') });
      const result = await fc.jobs[method]({ sources: [{ fileRef: 'upload_1' }] } as never);
      expect(requests[0]!.url).toBe(`https://api.filecheck.io/jobs/${method}`);
      expect(body(requests[0]!)).not.toHaveProperty('sync');
      expect(result.pending).toBe(true);
    }
  });

  it('does not leak wait options into the request body', async () => {
    const { fc, requests } = client({ status: 201, body: fixture('job.lean.json') });
    await fc.jobs.create({
      sources: [{ url: 'https://x.example/a.pdf', steps: [] }],
      wait: false,
      waitTimeoutMs: 5_000,
    });
    const sent = body(requests[0]!);
    expect(sent).not.toHaveProperty('wait');
    expect(sent).not.toHaveProperty('waitTimeoutMs');
  });
});

describe('jobs reads', () => {
  it('retrieve unwraps { job }', async () => {
    const { fc } = client({ status: 200, body: fixture('job.full.json') });
    const job = await fc.jobs.retrieve('job_01jf8n2q4vxw9k3m5p7r9t1v3x');
    expect(job.id).toBe('job_01jf8n2q4vxw9k3m5p7r9t1v3x');
    expect(job.deliverables[0]?.downloadUrl).toContain('X-Amz-Signature');
  });

  it('retrieveRuns parses the un-wrapped runs envelope', async () => {
    const { fc, requests } = client({ status: 200, body: fixture('job.runs.json') });
    const runs = await fc.jobs.retrieveRuns('job_01jf8n2q4vxw9k3m5p7r9t1v3x');
    expect(requests[0]!.url).toContain('expand=runs');
    expect(runs.runs[0]).toMatchObject({ name: 'business-card.pdf', hasOutput: true });
    expect(runs.runs[0]!.proofs[0]!.url).toContain('proof-1.png');
  });

  it('list passes limit/nextKey and returns the page', async () => {
    const { fc, requests } = client({ status: 200, body: fixture('jobs.list.json') });
    const page = await fc.jobs.list({ limit: 20, nextKey: 'abc' });
    expect(requests[0]!.url).toContain('limit=20');
    expect(requests[0]!.url).toContain('nextKey=abc');
    expect(page.jobs).toHaveLength(2);
    expect(page.nextKey).toBeTruthy();
  });

  it('iterate drains nextKey pages', async () => {
    const lastPage = { jobs: [makeJob({ id: 'job_last' })], nextKey: null };
    const { fc } = client(
      { status: 200, body: fixture('jobs.list.json') },
      { status: 200, body: JSON.stringify(lastPage) },
    );
    const ids: string[] = [];
    for await (const job of fc.jobs.iterate()) ids.push(job.id);
    expect(ids).toHaveLength(3);
    expect(ids[2]).toBe('job_last');
  });

  it('del issues DELETE', async () => {
    const { fc, requests } = client({
      status: 200,
      body: '{"id":"job_1","taskIds":["task_1"]}',
    });
    const result = await fc.jobs.del('job_1');
    expect(requests[0]!.method).toBe('DELETE');
    expect(result.taskIds).toEqual(['task_1']);
  });

  it('waitUntilTerminal polls until done', async () => {
    const { fc, requests } = client(
      { status: 200, body: JSON.stringify({ job: makeJob({ status: 'running' }) }) },
      { status: 200, body: fixture('job.full.json') },
    );
    const job = await fc.jobs.waitUntilTerminal('job_1', { pollIntervalMs: 1 });
    expect(job.status).toBe('done');
    expect(requests.length).toBe(2);
  });
});

describe('library resources', () => {
  it('uses the right envelope keys, including presets', async () => {
    const wf = client({ status: 200, body: '{"workflows":[{"id":"wf_1"}]}' });
    expect(await wf.fc.workflows.list()).toEqual([{ id: 'wf_1' }]);

    const presets = client({ status: 200, body: '{"presets":[{"id":"opt_1"}]}' });
    expect(await presets.fc.optimizePresets.list()).toEqual([{ id: 'opt_1' }]);
    expect(presets.requests[0]!.url).toBe('https://api.filecheck.io/optimize-presets');

    const one = client({ status: 200, body: '{"workflow":{"id":"wf_1"}}' });
    expect(await one.fc.workflows.retrieve('wf_1')).toEqual({ id: 'wf_1' });
  });
});

describe('orders', () => {
  it('posts to /orders/{id}', async () => {
    const { fc, requests } = client({
      status: 200,
      body: '{"success":true,"affectedJobIds":["job_1"]}',
    });
    const result = await fc.orders.create('order_55', { status: 'paid' });
    expect(requests[0]!.url).toBe('https://api.filecheck.io/orders/order_55');
    expect(result.affectedJobIds).toEqual(['job_1']);
  });
});

describe('fixture sanity', () => {
  it('lean fixture has no summary/results; full fixture has both', () => {
    const lean = fixtureJson<{ job: Record<string, unknown> }>('job.lean.json').job;
    const full = fixtureJson<{ job: Record<string, unknown> }>('job.full.json').job;
    expect(lean.summary).toBeUndefined();
    expect(lean.results).toBeUndefined();
    expect(full.summary).toBeDefined();
    expect(full.results).toBeDefined();
  });
});
