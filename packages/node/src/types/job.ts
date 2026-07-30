/**
 * Response types, hand-aligned with the API's response formatter
 * (`filecheck-api/_layers/mixins/nodejs/format.mjs` — formatJob / formatTask
 * / formatStep and the result extractors). Enum values from `steps.mjs`.
 *
 * Lean vs full: creation responses (201/202) and `GET /jobs` list entries
 * are LEAN — no `summary`, no `results`, truncated steps. Only a non-lean
 * detail read (`GET /jobs/{id}`, or a 200 sync submit) carries the full
 * shape. Fields only present on full responses are optional here.
 */

export type JobStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

/** Task/step outcome; `mixed` additionally appears at the job level. */
export type Outcome = 'pass' | 'warn' | 'fail' | 'fixed' | 'unchanged' | 'na' | 'mixed';

export type OnFailPolicy = 'reject' | 'accept_with_warnings' | 'manual_review';

export type StepType =
  | 'preflight'
  | 'autofix'
  | 'repreflight'
  | 'validate'
  | 'previews'
  | 'optimize'
  | 'convert'
  | 'upscale'
  | 'removebg'
  | 'split_pages'
  | 'deliver'
  | 'proof';

export type FileType = 'pdf' | 'raster' | 'vector' | 'office' | 'archive' | 'font' | 'other';

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'done',
  'skipped',
  'error',
]);

/** A job (or task) will not transition again once its status is terminal. */
export function isTerminal(subject: { status: JobStatus }): boolean {
  return TERMINAL_STATUSES.has(subject.status);
}

/** File/report artifact pointer. `downloadUrl` only when the read was signed. */
export interface Artifact {
  role?: string;
  kind?: string;
  taskId?: string;
  bucket?: string | null;
  key?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  fileName?: string | null;
  /** Presigned GET URL (60-minute TTL) — present on signed detail reads. */
  downloadUrl?: string | null;
  expiresIn?: number | null;
  [key: string]: unknown;
}

export interface Step {
  id: string;
  type: StepType;
  status: JobStatus;
  outcome: Outcome | null;
  reason: string | null;
  params: Record<string, unknown> | null;
  /** Full (non-lean) responses only. */
  runtimeParams?: Record<string, unknown> | null;
  started?: string | null;
  ended?: string | null;
  duration?: number | null;
  inStream?: string | null;
  outputs?: Array<Record<string, unknown>>;
}

export interface Task {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
  status: JobStatus;
  outcome: Outcome | null;
  fileType: FileType | null;
  mimeType: string | null;
  source: string | null;
  fileRef: string | null;
  clientRef: string | null;
  jobId: string | null;
  wfPhase: string | null;
  wfKind: string | null;
  originalArtifact: Artifact | null;
  /**
   * OMITTED (undefined) whenever `outputArtifacts` is non-empty — the
   * formatter suppresses them once outputs exist.
   */
  inputArtifact?: Artifact | null;
  currentArtifact?: Artifact | null;
  outputArtifacts: Artifact[];
  steps: Step[];
  /** Only when the rule defines cardinality slots (e.g. 'Front'/'Back'). */
  slot?: string | null;
}

/** Written at finalization; present on non-lean reads of terminal jobs. */
export interface JobSummary {
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
}

interface ResultHeader {
  taskId: string;
  fileRef: string | null;
  source: string | null;
  fileType: FileType | null;
  mimeType: string | null;
  status: JobStatus;
  outcome: Outcome | null;
}

export interface ValidateProfileResult {
  requested: string | null;
  matched: string | null;
  profileName: string | null;
  compliant: boolean;
  checks: { passed: number; failed: number };
  rules: { passed: number; failed: number };
  failures: unknown[];
}

export interface ValidateResult extends ResultHeader {
  compliant: boolean;
  profiles: ValidateProfileResult[];
}

export interface PreflightResult extends ResultHeader {
  report: Record<string, unknown> | null;
}

export interface OptimizeResult extends ResultHeader {
  output: {
    bucket: string | null;
    key: string | null;
    sizeBytes: number | null;
    downloadUrl: string | null;
    expiresIn: number | null;
    appliedFixes?: unknown;
    skippedFixes?: unknown;
  } | null;
}

export interface Job {
  id: string;
  createdAt: string | null;
  modifiedAt: string | null;
  /** Set while pending (abandoned-intake TTL) or on previews; null after. */
  expiresAt: string | null;
  status: JobStatus;
  outcome: Outcome | null;
  channel: string | null;
  ruleId: string | null;
  /** Response-only — `POST /jobs` does not accept a workflowId. */
  workflowId: string | null;
  wfPhase: string | null;
  wfStreamStatus: string | null;
  metaData: Record<string, unknown> | null;
  /** The job's finalized file set — the single download surface. */
  deliverables: Artifact[];
  tasks: Task[];
  orderId: string | null;
  customerId: string | null;
  orderStatus: string | null;
  orderDetails: Record<string, unknown> | null;
  customerEmail: string | null;
  /** Non-lean reads of terminal jobs only. */
  summary?: JobSummary;
  /** Non-lean reads only; keys present only for step types that ran. */
  results?: {
    validate?: ValidateResult[];
    preflight?: PreflightResult[];
    optimize?: OptimizeResult[];
  };
}

/** `GET /jobs/{id}?expand=runs` — a different envelope, no `job` wrapper. */
export interface JobRuns {
  id: string;
  status: JobStatus;
  outcome: Outcome | null;
  runs: Run[];
}

export interface Run {
  id: string;
  name: string;
  outcome: Outcome | null;
  status: JobStatus;
  hasOutput: boolean;
  proofs: Array<{ url: string }>;
  downloadUrl: string | null;
}

export interface JobPage {
  jobs: Job[];
  nextKey?: string | null;
}

export interface DeleteJobResult {
  id: string;
  taskIds?: string[];
  [key: string]: unknown;
}

export interface OrderResult {
  success: boolean;
  affectedJobIds: string[];
  [key: string]: unknown;
}
