import { FilecheckError } from '../errors.js';
import type { Requestor } from '../http/requestor.js';
import { sleep } from '../http/retry.js';
import type { DeleteJobResult, Job, JobPage, JobRuns } from '../types/job.js';
import { isTerminal } from '../types/job.js';
import type {
  CreateJobParams,
  FixParams,
  JobResult,
  ListJobsParams,
  OptimizeParams,
  PreflightParams,
  PreviewsParams,
  ValidateParams,
  WaitOptions,
} from '../types/params.js';
import { resolveVerify } from '../verify.js';
import type { VerifyOptions, VerifyResult } from '../verify.js';

const DEFAULT_WAIT_TIMEOUT_MS = 120_000;
/** Mirrors the server's own submit-poll backoff (250 ms → 2 s). */
const POLL_MIN_MS = 250;
const POLL_MAX_MS = 2_000;

/** Which raw flag an endpoint uses to flip its sync/async default. */
type FlagStyle = 'sync-flag' | 'async-flag';

export class JobsResource {
  constructor(private readonly requestor: Requestor) {}

  /**
   * Canonical `POST /jobs`. Async by default; pass `wait: true` to resolve
   * with a terminal job. Note the API does not accept a `workflowId` here —
   * workflow-driven jobs are created through the browser Element.
   */
  create(params: CreateJobParams & WaitOptions): Promise<JobResult> {
    return this.submit('/jobs', params, 'sync-flag', false);
  }

  /** `POST /jobs/preflight` — async by default. */
  preflight(params: PreflightParams & WaitOptions): Promise<JobResult> {
    return this.submit('/jobs/preflight', params, 'sync-flag', false);
  }

  /** `POST /jobs/previews` — async by default. */
  previews(params: PreviewsParams & WaitOptions): Promise<JobResult> {
    return this.submit('/jobs/previews', params, 'sync-flag', false);
  }

  /** `POST /jobs/fix` — async by default. */
  fix(params: FixParams & WaitOptions): Promise<JobResult> {
    return this.submit('/jobs/fix', params, 'sync-flag', false);
  }

  /** `POST /jobs/validate` — waits by default. */
  validate(params: ValidateParams & WaitOptions): Promise<JobResult> {
    return this.submit('/jobs/validate', params, 'async-flag', true);
  }

  /** `POST /jobs/optimize` — waits by default. */
  optimize(params: OptimizeParams & WaitOptions): Promise<JobResult> {
    return this.submit('/jobs/optimize', params, 'async-flag', true);
  }

  async retrieve(id: string): Promise<Job> {
    const { data } = await this.requestor.json<{ job: Job }>('GET', `/jobs/${id}`);
    return data.job;
  }

  /** `?expand=runs` — flattened per-file summary with proof + download URLs. */
  async retrieveRuns(id: string): Promise<JobRuns> {
    const { data } = await this.requestor.json<JobRuns>('GET', `/jobs/${id}`, {
      query: { expand: 'runs' },
    });
    return data;
  }

  async list(params: ListJobsParams = {}): Promise<JobPage> {
    const { data } = await this.requestor.json<JobPage>('GET', '/jobs', {
      query: {
        limit: params.limit,
        nextKey: params.nextKey,
        preview: params.preview ? 'true' : undefined,
      },
    });
    return data;
  }

  /** Auto-paginates over `list()` following `nextKey`. */
  async *iterate(params: ListJobsParams = {}): AsyncGenerator<Job, void, undefined> {
    let nextKey = params.nextKey;
    do {
      const page = await this.list({ ...params, nextKey });
      yield* page.jobs;
      nextKey = page.nextKey ?? undefined;
    } while (nextKey);
  }

  async del(id: string): Promise<DeleteJobResult> {
    const { data } = await this.requestor.json<DeleteJobResult>('DELETE', `/jobs/${id}`, {
      idempotent: false,
    });
    return data;
  }

  /** Poll `GET /jobs/{id}` until terminal. Throws FilecheckError on timeout. */
  async waitUntilTerminal(
    id: string,
    options: { timeoutMs?: number; pollIntervalMs?: number } = {},
  ): Promise<Job> {
    const { job, terminal } = await this.pollUntilTerminal(
      id,
      options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS,
      options.pollIntervalMs,
    );
    if (!terminal) {
      throw new FilecheckError(
        `Timed out waiting for job ${id} to reach a terminal status (last: ${job.status})`,
      );
    }
    return job;
  }

  /**
   * The server-side fulfillment gate: fetch the job and check that it is
   * terminal and proceedable (the Element's `canProceed` equivalent), and —
   * when `workflowId` is given — that it ran the expected workflow.
   */
  async verify(jobId: string, options: VerifyOptions = {}): Promise<VerifyResult> {
    const job = await this.retrieve(jobId);
    return resolveVerify(job, options);
  }

  private async submit(
    path: string,
    params: object & WaitOptions,
    flagStyle: FlagStyle,
    defaultWait: boolean,
  ): Promise<JobResult> {
    const {
      wait = defaultWait,
      waitTimeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
      ...body
    } = params as WaitOptions & Record<string, unknown>;

    // Normalize the API's inconsistent flags behind `wait`.
    if (flagStyle === 'sync-flag') {
      if (wait) (body as Record<string, unknown>).sync = true;
    } else if (!wait) {
      (body as Record<string, unknown>).async = true;
    }

    const { status, data } = await this.requestor.json<{ pending?: boolean; job: Job }>(
      'POST',
      path,
      { body, idempotent: false },
    );

    let job = data.job;

    // 202 = the server's ~27 s wait budget expired; keep waiting client-side.
    if (status === 202 && wait && waitTimeoutMs > 0) {
      const result = await this.pollUntilTerminal(job.id, waitTimeoutMs);
      job = result.job;
    }

    return { job, pending: !isTerminal(job) };
  }

  private async pollUntilTerminal(
    id: string,
    timeoutMs: number,
    fixedIntervalMs?: number,
  ): Promise<{ job: Job; terminal: boolean }> {
    const deadline = Date.now() + timeoutMs;
    let delay = fixedIntervalMs ?? POLL_MIN_MS;
    let job = await this.retrieve(id);

    while (!isTerminal(job) && Date.now() < deadline) {
      await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
      if (fixedIntervalMs === undefined) delay = Math.min(delay * 2, POLL_MAX_MS);
      job = await this.retrieve(id);
    }
    return { job, terminal: isTerminal(job) };
  }
}
