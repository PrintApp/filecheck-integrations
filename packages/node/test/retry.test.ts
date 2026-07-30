import { afterEach, describe, expect, it, vi } from 'vitest';
import { Filecheck, RateLimitError } from '../src/index.js';
import { createMockFetch, fixture } from './helpers/mock-fetch.js';

const SK = 'sk_0123456789abcdef0123456789abcdef';

afterEach(() => {
  vi.useRealTimers();
});

describe('retry policy', () => {
  it('retries GETs on 503 then succeeds', async () => {
    vi.useFakeTimers();
    const { mockFetch, requests } = createMockFetch(
      { status: 503, body: '{"message":"Service Unavailable"}' },
      { status: 200, body: fixture('job.full.json') },
    );
    const fc = new Filecheck(SK, { fetch: mockFetch, maxRetries: 2 });

    const promise = fc.jobs.retrieve('job_1');
    await vi.advanceTimersByTimeAsync(10_000);
    const job = await promise;

    expect(requests).toHaveLength(2);
    expect(job.id).toBe('job_01jf8n2q4vxw9k3m5p7r9t1v3x');
  });

  it('retries GETs on network failure', async () => {
    vi.useFakeTimers();
    const { mockFetch, requests } = createMockFetch(
      { status: 0, error: new TypeError('socket hang up') },
      { status: 200, body: fixture('job.full.json') },
    );
    const fc = new Filecheck(SK, { fetch: mockFetch, maxRetries: 1 });

    const promise = fc.jobs.retrieve('job_1');
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;
    expect(requests).toHaveLength(2);
  });

  it('gives up after maxRetries and surfaces the mapped error', async () => {
    vi.useFakeTimers();
    const { mockFetch, requests } = createMockFetch(
      { status: 429, body: '{}' },
      { status: 429, body: '{}' },
      { status: 429, body: '{}' },
    );
    const fc = new Filecheck(SK, { fetch: mockFetch, maxRetries: 2 });

    const promise = fc.jobs.retrieve('job_1').catch((e) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await promise).toBeInstanceOf(RateLimitError);
    expect(requests).toHaveLength(3);
  });

  it('honors Retry-After', async () => {
    vi.useFakeTimers();
    const { mockFetch, requests } = createMockFetch(
      { status: 429, body: '{}', headers: { 'Retry-After': '3' } },
      { status: 200, body: fixture('job.full.json') },
    );
    const fc = new Filecheck(SK, { fetch: mockFetch, maxRetries: 1 });

    const promise = fc.jobs.retrieve('job_1');
    await vi.advanceTimersByTimeAsync(2_900);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    await promise;
    expect(requests).toHaveLength(2);
  });

  it('NEVER retries POSTs — not on 5xx', async () => {
    const { mockFetch, requests } = createMockFetch({ status: 503, body: '{}' });
    const fc = new Filecheck(SK, { fetch: mockFetch, maxRetries: 5 });

    await expect(
      fc.jobs.create({ sources: [{ url: 'https://x.example/a.pdf', steps: [] }] }),
    ).rejects.toThrow();
    expect(requests).toHaveLength(1);
  });

  it('NEVER retries POSTs — not on network errors either', async () => {
    const { mockFetch, requests } = createMockFetch({
      status: 0,
      error: new TypeError('socket hang up'),
    });
    const fc = new Filecheck(SK, { fetch: mockFetch, maxRetries: 5 });

    await expect(
      fc.jobs.create({ sources: [{ url: 'https://x.example/a.pdf', steps: [] }] }),
    ).rejects.toThrow();
    expect(requests).toHaveLength(1);
  });
});
