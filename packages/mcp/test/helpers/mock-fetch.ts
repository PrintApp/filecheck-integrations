import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(__dirname, '..', '..', '..', '..', 'fixtures');

export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

export function fixtureJson<T = any>(name: string): T {
  return JSON.parse(fixture(name)) as T;
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | FormData;
}

export interface QueuedResponse {
  status: number;
  body?: string;
  headers?: Record<string, string>;
  /** Throw instead of responding (network failure). */
  error?: Error;
}

/**
 * Queue-based fetch stub. Each call consumes the next queued response and
 * records the request for assertions. Throws if the queue runs dry.
 */
export function createMockFetch(...queue: QueuedResponse[]) {
  const requests: RecordedRequest[] = [];
  const pending = [...queue];

  const mockFetch = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string | FormData },
  ) => {
    requests.push({ url, method: init.method, headers: init.headers, body: init.body });
    const next = pending.shift();
    if (!next) throw new Error(`mock fetch queue empty (request ${requests.length}: ${url})`);
    if (next.error) throw next.error;
    const headers = new Map(
      Object.entries(next.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    return {
      status: next.status,
      headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
      text: async () => next.body ?? '',
    };
  };

  return { mockFetch, requests, push: (r: QueuedResponse) => pending.push(r) };
}

/** A terminal preflight job (done + fail) with a full evaluation. */
export function makePreflightJob(overrides: Record<string, unknown> = {}) {
  const base = fixtureJson<{ job: Record<string, unknown> }>('job.preflight.json').job;
  return { ...base, ...overrides };
}

export function jobBody(job: Record<string, unknown>): string {
  return JSON.stringify({ job });
}
