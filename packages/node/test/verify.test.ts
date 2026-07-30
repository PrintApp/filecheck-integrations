import { describe, expect, it } from 'vitest';
import { Filecheck, resolveVerify } from '../src/index.js';
import type { Job } from '../src/index.js';
import { createMockFetch, fixture, makeVerifyJob } from './helpers/mock-fetch.js';

const SK = 'sk_0123456789abcdef0123456789abcdef';

describe('resolveVerify — outcome × policy truth table', () => {
  // Mirrors intakeStatusFor() in filecheck/packages/core/src/data/job/display.js.
  const cases: Array<{
    outcomes: Array<string | null>;
    onFail?: string;
    state: string;
    ok: boolean;
  }> = [
    { outcomes: ['pass'], onFail: 'reject', state: 'ready', ok: true },
    { outcomes: ['pass', 'pass'], onFail: 'reject', state: 'ready', ok: true },
    { outcomes: ['warn'], onFail: 'reject', state: 'partial', ok: true },
    { outcomes: ['pass', 'warn'], onFail: 'reject', state: 'partial', ok: true },
    { outcomes: ['fail'], onFail: 'reject', state: 'rejected', ok: false },
    { outcomes: ['mixed'], onFail: 'reject', state: 'rejected', ok: false },
    { outcomes: ['pass', 'fail'], onFail: 'reject', state: 'rejected', ok: false },
    { outcomes: ['fail'], onFail: 'accept_with_warnings', state: 'partial', ok: true },
    { outcomes: ['fail'], onFail: 'manual_review', state: 'partial', ok: true },
    { outcomes: ['mixed'], onFail: 'accept_with_warnings', state: 'partial', ok: true },
    { outcomes: ['fixed', 'unchanged', 'na'], onFail: 'reject', state: 'ready', ok: true },
    // no policy in summary → defaults to reject
    { outcomes: ['fail'], onFail: undefined, state: 'rejected', ok: false },
    { outcomes: [null], onFail: 'reject', state: 'ready', ok: true },
  ];

  for (const { outcomes, onFail, state, ok } of cases) {
    it(`outcomes=[${outcomes}] onFail=${onFail ?? '(default)'} → ${state}/${ok}`, () => {
      const job = makeVerifyJob(outcomes, onFail) as unknown as Job;
      const result = resolveVerify(job);
      expect(result.state).toBe(state);
      expect(result.ok).toBe(ok);
      if (!ok) expect(result.reason).toBe('cannot_proceed');
    });
  }

  it('an options.policy override wins over summary.policy', () => {
    const job = makeVerifyJob(['fail'], 'reject') as unknown as Job;
    const result = resolveVerify(job, { policy: 'accept_with_warnings' });
    expect(result.state).toBe('partial');
    expect(result.ok).toBe(true);
  });

  it('non-terminal job → not_terminal', () => {
    const job = makeVerifyJob(['pass'], 'reject', { status: 'running' }) as unknown as Job;
    const result = resolveVerify(job);
    expect(result).toMatchObject({ ok: false, state: 'not_terminal', reason: 'not_terminal' });
  });

  it('workflow mismatch → ok false with workflow_mismatch', () => {
    const job = makeVerifyJob(['pass'], 'reject') as unknown as Job;
    const result = resolveVerify(job, { workflowId: 'wf_other' });
    expect(result).toMatchObject({ ok: false, reason: 'workflow_mismatch', state: 'ready' });
  });

  it('workflow match passes', () => {
    const job = makeVerifyJob(['pass'], 'reject') as unknown as Job;
    const result = resolveVerify(job, { workflowId: 'wf_business_cards' });
    expect(result.ok).toBe(true);
  });

  it('strict mode fails closed on status:error jobs', () => {
    const job = makeVerifyJob(['pass'], 'reject', { status: 'error' }) as unknown as Job;
    expect(resolveVerify(job).ok).toBe(true); // terminal 'error' + no failing outcome
    const strict = resolveVerify(job, { strict: true });
    expect(strict).toMatchObject({ ok: false, reason: 'cannot_proceed' });
  });
});

describe('jobs.verify (integration)', () => {
  it('fetches the job and resolves', async () => {
    const { mockFetch } = createMockFetch({ status: 200, body: fixture('job.full.json') });
    const fc = new Filecheck(SK, { fetch: mockFetch });
    const result = await fc.jobs.verify('job_01jf8n2q4vxw9k3m5p7r9t1v3x', {
      workflowId: 'wf_business_cards',
    });
    expect(result.ok).toBe(true);
    expect(result.state).toBe('ready');
    expect(result.job.id).toBe('job_01jf8n2q4vxw9k3m5p7r9t1v3x');
  });
});
