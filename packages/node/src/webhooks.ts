import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebhookSignatureError } from './errors.js';
import type { Artifact, JobStatus, OnFailPolicy, Outcome } from './types/job.js';

/**
 * Webhook helper.
 *
 * IMPORTANT — signing status: Filecheck's per-job `job.completed` webhooks
 * are delivered UNSIGNED today; the signature scheme is not finalized. This
 * helper is structured so that when signing ships (expected:
 * `x-filecheck-signature: <hex>` = HMAC-SHA256 over the raw body),
 * verification becomes the default without breaking changes. Until then,
 * pass `{ verify: false }` — an explicit, temporary escape hatch — or a
 * secret+header pair if you front the endpoint with your own signing proxy.
 *
 * Always pass the RAW request body (string/Buffer), never a re-serialized
 * parsed object: `express.raw({ type: 'application/json' })`,
 * `await request.text()`, etc.
 */

/** `job.completed` payload — the finalization summary spread + tasks[]. */
export interface JobCompletedPayload {
  id: string;
  domainIdx: number;
  status: JobStatus;
  outcome: Outcome | null;
  ruleId: string | null;
  channel: string | null;
  customerId: string | null;
  orderId: string | null;
  policy: { onFail?: OnFailPolicy } | null;
  metaData: Record<string, unknown> | null;
  taskIds: string[];
  sourceRefs: Array<{ taskId: string | null; bucket: string; key: string }>;
  created: number | null;
  finalized: string;
  tasks: Array<{
    id: string;
    status: JobStatus | null;
    outcome: Outcome | null;
    mimeType: string | null;
    fileType: string | null;
    clientRef: string | null;
    source: string | null;
    fileRef: string | null;
    sourceRef: { bucket: string; key: string } | null;
    originalArtifact: Artifact | null;
    outputArtifacts: Artifact[];
    steps: Array<{
      id: string;
      type: string;
      status: JobStatus;
      outcome: Outcome | null;
      reason: string | null;
      outputs: unknown[];
      ended: string | null;
    }>;
  }>;
}

/** `job.created` payload (subscription webhooks). */
export interface JobCreatedPayload {
  id: string;
  status: JobStatus;
  channel: string | null;
  ruleId: string | null;
  customerId: string | null;
  orderId: string | null;
  taskCount: number;
  created: number | string | null;
  [key: string]: unknown;
}

export type WebhookEvent =
  | { type: 'job.completed'; payload: JobCompletedPayload; verified: boolean }
  | { type: 'job.created'; payload: JobCreatedPayload; verified: boolean }
  | { type: 'unknown'; payload: Record<string, unknown>; verified: boolean };

export interface ConstructEventOptions {
  /**
   * Set to `false` to accept an unsigned payload. TEMPORARY: required today
   * because Filecheck webhooks are not yet signed. Once the signing scheme
   * ships, omit this and pass the secret instead.
   */
  verify?: boolean;
}

export function computeSignature(secret: string, rawBody: string | Buffer): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Parse (and, when possible, verify) a webhook request into a typed event.
 *
 * Payloads carry no event-type envelope, so the type is detected from the
 * payload shape: a finalization summary (`taskIds` + `finalized` + `tasks`)
 * is `job.completed`; a creation stub (`taskCount`) is `job.created`.
 */
export function constructEvent(
  rawBody: string | Buffer,
  signatureHeader?: string | null,
  secret?: string | null,
  options: ConstructEventOptions = {},
): WebhookEvent {
  const text = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

  let verified = false;
  if (secret && signatureHeader) {
    const expected = computeSignature(secret, rawBody);
    if (!safeEqualHex(expected, signatureHeader.trim())) {
      throw new WebhookSignatureError('Webhook signature verification failed');
    }
    verified = true;
  } else if (options.verify !== false) {
    throw new WebhookSignatureError(
      'Webhook payload has no verifiable signature. Filecheck webhooks are not yet signed — ' +
        'pass { verify: false } to accept unsigned payloads (temporary until the signing scheme ships).',
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new WebhookSignatureError('Webhook body is not valid JSON');
  }

  if (Array.isArray(payload.taskIds) && payload.finalized && Array.isArray(payload.tasks)) {
    return { type: 'job.completed', payload: payload as unknown as JobCompletedPayload, verified };
  }
  if (typeof payload.taskCount === 'number') {
    return { type: 'job.created', payload: payload as unknown as JobCreatedPayload, verified };
  }
  return { type: 'unknown', payload, verified };
}

export const webhooks = { constructEvent, computeSignature };
