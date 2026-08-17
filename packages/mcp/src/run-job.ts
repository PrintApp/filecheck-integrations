import { isTerminal } from 'filecheck-node';
import type { Filecheck, Job, JobResult, WaitOptions } from 'filecheck-node';
import type { Capabilities } from './capabilities.js';

/**
 * A sync submit makes the API hold the request up to ~27 s. Only worth it
 * when our own budget can absorb that hold (the stdio CLI); the remote
 * Lambda (20 s budget inside a 29 s gateway ceiling) submits async and
 * polls instead.
 */
const SYNC_HOLD_THRESHOLD_MS = 30_000;
const POLL_MIN_MS = 500;
const POLL_MAX_MS = 2_000;

export interface RunOutcome {
  job: Job;
  pending: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Submit a job and wait for a terminal status within the capability budget.
 * Always ends on a `GET /jobs/{id}` when terminal — submit responses carry
 * unsigned artifacts; only the detail read mints download URLs.
 */
export async function submitAndWait(
  client: Filecheck,
  caps: Capabilities,
  submit: (wait: WaitOptions) => Promise<JobResult>,
  waitSeconds?: number,
): Promise<RunOutcome> {
  const budgetMs = Math.min(
    waitSeconds !== undefined ? waitSeconds * 1000 : caps.maxWaitMs,
    caps.maxWaitMs,
  );
  const deadline = Date.now() + budgetMs;
  const useSync = budgetMs >= SYNC_HOLD_THRESHOLD_MS;

  const { job } = await submit(
    useSync ? { wait: true, waitTimeoutMs: budgetMs } : { wait: false, waitTimeoutMs: 0 },
  );

  let final = job;
  if (isTerminal(final)) {
    final = await client.jobs.retrieve(final.id);
  } else if (Date.now() < deadline) {
    final = await poll(client, final.id, deadline);
  }
  return { job: final, pending: !isTerminal(final) };
}

async function poll(client: Filecheck, id: string, deadline: number): Promise<Job> {
  let delay = POLL_MIN_MS;
  let job = await client.jobs.retrieve(id);
  while (!isTerminal(job) && Date.now() < deadline) {
    await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
    delay = Math.min(delay * 2, POLL_MAX_MS);
    job = await client.jobs.retrieve(id);
  }
  return job;
}
