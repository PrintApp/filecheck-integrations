import type { Job } from 'filecheck-node';
import { describe, expect, it } from 'vitest';
import { formatJobResult } from '../src/format.js';
import { call, connectHarness } from './helpers/mcp-client.js';
import { jobBody } from './helpers/mock-fetch.js';

// A fix job shaped like job_01M7W5RC4WGPF9QBKHVQ12VRBW (2026-11-20): a DTF
// sheet on a white background. The first check rejects transparent_background
// and plans background removal + upscale; the re-check of the fixed file
// passes transparency and fails only effective_dpi. The API's
// results.preflight carries the FIRST check, while the outcome is the re-check's,
// so fix_file listed transparent_background as a reject next to outcome fail.

const finding = (ruleId: string, severity: string, autofix = false) => ({
  sectionId: 'raster',
  ruleId,
  severity,
  effectiveSeverity: severity,
  ...(autofix ? { autofix: { available: true, runner: 'optimize' } } : {}),
});

const initialReport = {
  raster: { width: 4000, height: 6000 },
  evaluation: {
    summary: { fail: 1, warn: 0, ignored: 2, pass: 2, skipped: 0, autofixable: 2 },
    findings: [
      finding('raster.background_removal', 'autofix', true),
      finding('raster.effective_dpi', 'autofix', true),
      finding('raster.transparent_background', 'reject'),
    ],
    recommendedAutofix: {
      runner: 'optimize',
      params: { removeBg: { enabled: true }, upscale: { minDpi: 300 } },
      fixes: ['raster.background_removal', 'raster.effective_dpi'],
    },
  },
};

const recheckReport = {
  raster: { width: 4096, height: 6144 },
  evaluation: {
    summary: { fail: 1, warn: 0, ignored: 1, pass: 3, skipped: 0, autofixable: 0 },
    findings: [finding('raster.effective_dpi', 'reject')],
  },
};

const step = (type: string, extra: Record<string, unknown> = {}) => ({
  id: `step_${type}`,
  type,
  status: 'done',
  outcome: null,
  reason: null,
  params: null,
  outputs: [],
  ...extra,
});

const reportOutput = (body: unknown) => ({
  kind: 'report',
  bucket: 'filecheck-reports',
  key: 'r.json',
  body,
});

function fixJob(
  opts: { repreflight?: 'report' | 'no-report' | 'none'; autofix?: boolean } = {},
): Record<string, unknown> {
  const { repreflight = 'report', autofix = true } = opts;
  const steps: Array<Record<string, unknown>> = [
    step('preflight', { outcome: 'fail', outputs: [reportOutput(initialReport)] }),
  ];
  if (autofix) steps.push(step('autofix', { outcome: 'fixed' }));
  if (repreflight === 'report') {
    steps.push(step('repreflight', { outcome: 'fail', outputs: [reportOutput(recheckReport)] }));
  } else if (repreflight === 'no-report') {
    steps.push(step('repreflight', { status: 'error', outputs: [] }));
  }
  const taskId = 'task_dtf';
  return {
    id: 'job_dtf',
    status: 'done',
    outcome: 'fail',
    deliverables: [],
    tasks: [{ id: taskId, status: 'done', outcome: 'fail', fileType: 'raster', steps }],
    results: {
      preflight: [
        {
          taskId,
          fileRef: null,
          source: 'https://filecheck.io/samples/dtf-gang-sheet-white-background.png',
          fileType: 'raster',
          mimeType: 'image/png',
          status: 'done',
          outcome: 'fail',
          report: initialReport,
        },
      ],
    },
  };
}

const format = (job: Record<string, unknown>) => {
  const result = formatJobResult({ job: job as unknown as Job, pending: false });
  return { result, file: (result.structuredContent as any).files[0] };
};
const ruleIds = (findings: Array<{ ruleId: string }>) => findings.map((f) => f.ruleId);

describe('fix jobs report the re-check of the fixed file', () => {
  it('lists the re-check findings, not the upload check findings', () => {
    const { result, file } = format(fixJob());
    expect(ruleIds(file.findings)).toEqual(['raster.effective_dpi']);
    expect(ruleIds(file.findings)).not.toContain('raster.transparent_background');
    expect(file.summary).toEqual(recheckReport.evaluation.summary);
    expect(file.checkedFile).toBe('fixed');
    // The plan that was already applied is not offered again.
    expect(file.recommendedAutofix).toBeUndefined();
    expect(result.content[0]!.text).toContain('re-check of the fixed file');
  });

  it('keeps what the upload had as initialCheck', () => {
    const { file } = format(fixJob());
    expect(file.initialCheck).toEqual({
      summary: initialReport.evaluation.summary,
      ruleIds: [
        'raster.background_removal',
        'raster.effective_dpi',
        'raster.transparent_background',
      ],
    });
  });

  it('says so when the findings predate the fix (no re-check)', () => {
    const { result, file } = format(fixJob({ repreflight: 'none' }));
    expect(file.checkedFile).toBe('original');
    expect(file.initialCheck).toBeUndefined();
    expect(ruleIds(file.findings)).toContain('raster.transparent_background');
    expect(result.content[0]!.text).toContain('BEFORE autofix');
  });

  it('falls back to the upload check when the re-check left no report', () => {
    const { file } = format(fixJob({ repreflight: 'no-report' }));
    expect(file.checkedFile).toBe('original');
    expect(ruleIds(file.findings)).toHaveLength(3);
  });

  it('leaves a plain check unchanged', () => {
    const { result, file } = format(fixJob({ repreflight: 'none', autofix: false }));
    expect(file.checkedFile).toBeUndefined();
    expect(file.initialCheck).toBeUndefined();
    expect(file.recommendedAutofix).toEqual(initialReport.evaluation.recommendedAutofix);
    expect(result.content[0]!.text).not.toContain('autofix');
  });

  it('get_job shows the re-check through the MCP server', async () => {
    const harness = await connectHarness([{ status: 200, body: jobBody(fixJob()) }]);
    const result = await call(harness.mcp, 'get_job', { jobId: 'job_dtf' });
    expect(result.isError).toBe(false);
    expect(ruleIds(result.structured.files[0].findings)).toEqual(['raster.effective_dpi']);
    expect(result.structured.files[0].checkedFile).toBe('fixed');
    await harness.close();
  });
});

describe('get_report on a fixed file', () => {
  it('reads the re-check by default, the same check get_job shows', async () => {
    const harness = await connectHarness([{ status: 200, body: jobBody(fixJob()) }]);
    const result = await call(harness.mcp, 'get_report', { jobId: 'job_dtf', severity: 'reject' });
    expect(result.structured.checkedFile).toBe('fixed');
    expect(ruleIds(result.structured.data)).toEqual(['raster.effective_dpi']);
    await harness.close();
  });

  it("reads the upload's check with check:'initial'", async () => {
    const harness = await connectHarness([{ status: 200, body: jobBody(fixJob()) }]);
    const result = await call(harness.mcp, 'get_report', {
      jobId: 'job_dtf',
      severity: 'reject',
      check: 'initial',
    });
    expect(result.structured.checkedFile).toBe('original');
    expect(ruleIds(result.structured.data)).toEqual(['raster.transparent_background']);
    await harness.close();
  });

  it('report sections come from the fixed file', async () => {
    const harness = await connectHarness([{ status: 200, body: jobBody(fixJob()) }]);
    const result = await call(harness.mcp, 'get_report', { jobId: 'job_dtf', section: 'raster' });
    expect(result.structured.data).toEqual({ width: 4096, height: 6144 });
    await harness.close();
  });
});
