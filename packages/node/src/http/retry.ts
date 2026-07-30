import { ConnectionError } from '../errors.js';
import type { HttpResponse } from './transport.js';

/**
 * Retry policy.
 *
 * The API supports no idempotency keys, so ONLY idempotent requests (GETs)
 * are ever auto-retried — a retried POST /jobs would create and bill a
 * duplicate job, and a thrown fetch error cannot distinguish "never sent"
 * from "sent, response lost".
 */

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/** Full-jitter exponential backoff, honoring Retry-After when present. */
export function backoffDelayMs(attempt: number, response?: HttpResponse): number {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  }
  const cap = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.random() * cap;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `attempt` with up to `maxRetries` retries. Retries on ConnectionError
 * and retryable HTTP statuses only. Callers must pass `idempotent: false`
 * for anything with side effects — those get exactly one attempt.
 */
export async function withRetries(
  attempt: () => Promise<HttpResponse>,
  options: { idempotent: boolean; maxRetries: number },
): Promise<HttpResponse> {
  const attempts = options.idempotent ? options.maxRetries + 1 : 1;

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    let response: HttpResponse;
    try {
      response = await attempt();
    } catch (error) {
      lastError = error;
      if (!(error instanceof ConnectionError) || i === attempts - 1) throw error;
      await sleep(backoffDelayMs(i));
      continue;
    }
    if (isRetryableStatus(response.status) && i < attempts - 1) {
      await sleep(backoffDelayMs(i, response));
      continue;
    }
    return response;
  }
  /* c8 ignore next */
  throw lastError instanceof Error ? lastError : new ConnectionError('Request failed');
}
