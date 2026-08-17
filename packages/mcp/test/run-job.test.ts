import type { Filecheck, Job, WaitOptions } from 'filecheck-node';
import { describe, expect, it, vi } from 'vitest';
import { LOCAL_CAPABILITIES, REMOTE_CAPABILITIES } from '../src/capabilities.js';
import { submitAndWait } from '../src/run-job.js';
import { makePreflightJob } from './helpers/mock-fetch.js';

function stubClient(retrieveQueue: Array<Record<string, unknown>>) {
  const retrieve = vi.fn(async () => {
    const next = retrieveQueue.shift();
    if (!next) throw new Error('retrieve queue empty');
    return next as unknown as Job;
  });
  return { client: { jobs: { retrieve } } as unknown as Filecheck, retrieve };
}

const terminal = () => makePreflightJob();
const running = () => makePreflightJob({ status: 'running', outcome: null });

describe('submitAndWait', () => {
  it('local budget: holds the submit sync, then re-reads for signing', async () => {
    const { client, retrieve } = stubClient([terminal()]);
    const waits: WaitOptions[] = [];
    const result = await submitAndWait(
      client,
      LOCAL_CAPABILITIES,
      async (wait) => {
        waits.push(wait);
        return { job: terminal() as unknown as Job, pending: false };
      },
      undefined,
    );
    expect(waits[0]).toEqual({ wait: true, waitTimeoutMs: LOCAL_CAPABILITIES.maxWaitMs });
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(result.pending).toBe(false);
    expect(result.job.status).toBe('done');
  });

  it('remote budget: submits async and polls to terminal', async () => {
    const { client, retrieve } = stubClient([running(), terminal()]);
    const waits: WaitOptions[] = [];
    const result = await submitAndWait(
      client,
      REMOTE_CAPABILITIES,
      async (wait) => {
        waits.push(wait);
        return { job: running() as unknown as Job, pending: true };
      },
      undefined,
    );
    expect(waits[0]).toEqual({ wait: false, waitTimeoutMs: 0 });
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(result.pending).toBe(false);
    expect(result.job.status).toBe('done');
  });

  it('waitSeconds 0 returns pending without any polling', async () => {
    const { client, retrieve } = stubClient([]);
    const result = await submitAndWait(
      client,
      LOCAL_CAPABILITIES,
      async () => ({ job: running() as unknown as Job, pending: true }),
      0,
    );
    expect(retrieve).not.toHaveBeenCalled();
    expect(result.pending).toBe(true);
  });

  it('caps waitSeconds at the capability budget', async () => {
    const { client } = stubClient([terminal()]);
    const waits: WaitOptions[] = [];
    await submitAndWait(
      client,
      LOCAL_CAPABILITIES,
      async (wait) => {
        waits.push(wait);
        return { job: terminal() as unknown as Job, pending: false };
      },
      999_999,
    );
    expect(waits[0]!.waitTimeoutMs).toBe(LOCAL_CAPABILITIES.maxWaitMs);
  });
});
