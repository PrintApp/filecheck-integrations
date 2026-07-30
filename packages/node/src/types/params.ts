import type { Job, OnFailPolicy } from './job.js';

/**
 * Request parameter types, aligned with the API's JSON schemas
 * (`filecheck-api/_layers/mixins/nodejs/schemas/*.json`). Note the schemas
 * use `additionalProperties: false` — unknown keys are 400s, which is why
 * these types are closed rather than index-signatured.
 */

/** Exactly one of `url` | `file` (base64) | `fileRef` | `source` per source. */
export interface SourceRef {
  /** Public (or header-authenticated) URL to pull the file from. */
  url?: string;
  /** Inline base64 file content (≤ ~7 MB decoded; prefer uploads.create). */
  file?: string;
  /** `upload_…` reference from `uploads.create()`. */
  fileRef?: string;
  /** Raw source pointer (advanced). */
  source?: string;
  /** Extra request headers used when fetching `url`. */
  headers?: Record<string, string>;
}

export interface JobStepInput {
  type: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CreateJobSource extends SourceRef {
  /** Pipeline for this source (1–16 steps). */
  steps: JobStepInput[];
  params?: Record<string, unknown>;
}

export interface WebhookParam {
  url: string;
  headers?: Record<string, string>;
}

/** `POST /jobs`. NOTE: `workflowId` is not accepted — it is response-only. */
export interface CreateJobParams {
  sources: CreateJobSource[];
  ruleId?: string;
  channel?: 'api' | 'store' | 'admin';
  customerId?: string;
  orderId?: string;
  policy?: { onFail: OnFailPolicy };
  webhook?: WebhookParam;
  metaData?: Record<string, unknown>;
}

/** PDF validation profile codes accepted by `POST /jobs/validate`. */
export type ValidateProfileCode =
  | 'auto'
  | '1a'
  | '1b'
  | '2a'
  | '2b'
  | '2u'
  | '3a'
  | '3b'
  | '3u'
  | '4'
  | '4e'
  | '4f'
  | 'ua1'
  | 'ua2';

export interface ValidateSource extends SourceRef {
  profile?: ValidateProfileCode | ValidateProfileCode[];
  name?: string;
  mimeType?: string;
}

export interface ValidateParams {
  sources: ValidateSource[];
  webhook?: WebhookParam;
  metaData?: Record<string, unknown>;
}

export interface PreflightSource extends SourceRef {
  profileId?: string;
  name?: string;
}

export interface PreflightParams {
  sources: PreflightSource[];
  webhook?: WebhookParam;
  metaData?: Record<string, unknown>;
}

export interface FixSource extends SourceRef {
  profileId?: string;
  items?: unknown[];
}

export interface FixParams {
  sources: FixSource[];
  /** Re-run preflight on the fixed output. */
  repreflight?: boolean;
  webhook?: WebhookParam;
  metaData?: Record<string, unknown>;
}

export interface PreviewsSource extends SourceRef {
  params?: Record<string, unknown>;
}

export interface PreviewsParams {
  sources: PreviewsSource[];
  webhook?: WebhookParam;
  metaData?: Record<string, unknown>;
}

export interface OptimizeSource extends SourceRef {
  /** Namespaced options: `params.pdf` and/or `params.raster`. */
  params: Record<string, unknown>;
}

export interface OptimizeParams {
  sources: OptimizeSource[];
  webhook?: WebhookParam;
  metaData?: Record<string, unknown>;
}

/**
 * Wait normalization. The raw API inconsistently uses `sync: true`
 * (jobs/preflight/previews/fix — async by default) and `async: true`
 * (validate/optimize — sync by default); the SDK hides both behind `wait`.
 */
export interface WaitOptions {
  /**
   * Wait for a terminal job before resolving. Defaults mirror each
   * endpoint's API default: false for create/preflight/previews/fix,
   * true for validate/optimize.
   */
  wait?: boolean;
  /**
   * Total wait budget in ms (default 120 000). The server itself waits up
   * to ~27 s; past that the SDK keeps polling `GET /jobs/{id}` client-side.
   * Set 0 for server-side wait only (a 202 then resolves `pending: true`).
   */
  waitTimeoutMs?: number;
}

/** Result of any submit method. `pending` means the job is not terminal yet. */
export interface JobResult {
  job: Job;
  pending: boolean;
}

export interface ListJobsParams {
  limit?: number;
  nextKey?: string;
  preview?: boolean;
}
