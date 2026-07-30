import type { Job, OnFailPolicy } from './types/job.js';
import { isTerminal } from './types/job.js';

/**
 * Pure server-side port of the Element's intake-status resolver
 * (`filecheck/packages/core/src/data/job/display.js` — `intakeStatusFor`,
 * terminal branch). The browser Element's `canProceed` is true exactly for
 * the `ready` and `partial` states; this mirrors that gate over the REST
 * Job shape.
 *
 * Known approximation: the Element resolves `onFail` per task file-type
 * from the rule's accept flows; the REST response carries no rule snapshot,
 * so only the job-level policy (`job.summary.policy.onFail`, default
 * `reject`) applies here. For rules mixing per-file-type policies, pass
 * `options.policy` explicitly.
 */

export type VerifyState = 'ready' | 'partial' | 'rejected' | 'not_terminal';
export type VerifyReason = 'not_terminal' | 'cannot_proceed' | 'workflow_mismatch';

export interface VerifyOptions {
  /** Assert the job ran the expected workflow (compared to `job.workflowId`). */
  workflowId?: string;
  /** Override the resolved onFail policy. */
  policy?: OnFailPolicy;
  /**
   * Fail closed on `status: 'error'` jobs even when no task outcome is a
   * fail. The browser Element fails open on transport errors; a server-side
   * fulfillment gate usually shouldn't.
   */
  strict?: boolean;
}

export interface VerifyResult {
  ok: boolean;
  state: VerifyState;
  job: Job;
  reason?: VerifyReason;
}

export function resolveVerify(job: Job, options: VerifyOptions = {}): VerifyResult {
  if (!isTerminal(job)) {
    return { ok: false, state: 'not_terminal', job, reason: 'not_terminal' };
  }

  const onFail: OnFailPolicy = options.policy ?? job.summary?.policy?.onFail ?? 'reject';

  let hasFail = false;
  let hasWarn = false;
  for (const task of job.tasks ?? []) {
    const outcome = task?.outcome;
    if (outcome === 'fail' || outcome === 'mixed') hasFail = true;
    else if (outcome === 'warn') hasWarn = true;
  }

  let state: VerifyState;
  if (hasFail) state = onFail === 'reject' ? 'rejected' : 'partial';
  else state = hasWarn ? 'partial' : 'ready';

  if (options.workflowId !== undefined && job.workflowId !== options.workflowId) {
    return { ok: false, state, job, reason: 'workflow_mismatch' };
  }

  if (options.strict && job.status === 'error') {
    return { ok: false, state, job, reason: 'cannot_proceed' };
  }

  const ok = state === 'ready' || state === 'partial';
  return ok ? { ok, state, job } : { ok, state, job, reason: 'cannot_proceed' };
}
