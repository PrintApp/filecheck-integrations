import type { Job } from 'filecheck-node';
import { describe, expect, it } from 'vitest';
import { formatJobResult, verdictText } from '../src/format.js';
import { makePreflightJob } from './helpers/mock-fetch.js';

const asJob = (value: Record<string, unknown>): Job => value as unknown as Job;

describe('verdictText', () => {
  it('never calls a failing check a success', () => {
    const failed = asJob(makePreflightJob());
    expect(verdictText(failed, false)).toContain('NOT print-ready');
    expect(verdictText(failed, false)).not.toMatch(/^Success/i);
  });

  it('distinguishes execution errors from verdicts', () => {
    const errored = asJob(makePreflightJob({ status: 'error', outcome: null }));
    expect(verdictText(errored, false)).toContain('execution error');
  });

  it('tells the agent to use the fixed deliverable', () => {
    const fixed = asJob(makePreflightJob({ status: 'done', outcome: 'fixed' }));
    expect(verdictText(fixed, false)).toContain('fixed deliverable');
  });
});

describe('formatJobResult', () => {
  it('caps findings across files and flags the truncation', () => {
    const base = makePreflightJob();
    const results = base.results as {
      preflight: Array<{ report: { evaluation: { findings: unknown[] } } }>;
    };
    const finding = results.preflight[0]!.report.evaluation.findings[0] as Record<string, unknown>;
    results.preflight[0]!.report.evaluation.findings = Array.from({ length: 25 }, (_, i) => ({
      ...finding,
      page: i + 1,
    }));

    const { structuredContent } = formatJobResult({ job: asJob(base), pending: false });
    const file = (structuredContent as any).files[0];
    expect(file.findings).toHaveLength(20);
    expect(file.findingsOmitted).toBe(5);
    expect((structuredContent as any).findingsTruncated).toBe(true);
  });

  it('strips bucket/key from deliverables but keeps the signed URL', () => {
    const { structuredContent } = formatJobResult({
      job: asJob(makePreflightJob()),
      pending: false,
    });
    const deliverable = (structuredContent as any).deliverables[0];
    expect(deliverable.bucket).toBeUndefined();
    expect(deliverable.key).toBeUndefined();
    expect(deliverable.downloadUrl).toBeTruthy();
    expect(deliverable.fileName).toBe('card.pdf');
  });

  it('notes when a file has no evaluation', () => {
    const base = makePreflightJob();
    const results = base.results as { preflight: Array<{ report: Record<string, unknown> }> };
    results.preflight[0]!.report.evaluation = undefined;
    const { structuredContent } = formatJobResult({ job: asJob(base), pending: false });
    const file = (structuredContent as any).files[0];
    expect(file.hasEvaluation).toBe(false);
    expect(file.note).toContain('get_report');
  });

  it('pending results carry a nextStep with the job id and no results', () => {
    const job = asJob(makePreflightJob({ status: 'running', outcome: null }));
    const { structuredContent } = formatJobResult({ job, pending: true });
    expect((structuredContent as any).pending).toBe(true);
    expect((structuredContent as any).nextStep).toContain(job.id);
    expect((structuredContent as any).files).toBeUndefined();
  });
});
