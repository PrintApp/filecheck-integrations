import {
  AuthenticationError,
  ConnectionError,
  FilecheckError,
  InvalidRequestError,
  NotFoundError,
  RateLimitError,
} from 'filecheck-node';
import type { Artifact, FailedSource, Job, PreflightResult, Step } from 'filecheck-node';
import type { LinkRewriter } from './capabilities.js';
import type { RunOutcome } from './run-job.js';

/** Findings cap across all files of a job — the rest lives behind get_report. */
const FINDINGS_LIMIT = 20;
/** Preview pages cap per task. */
const PAGES_LIMIT = 20;

/** Keys that are huge (geometry, fix params) or already lifted out. */
const FINDING_KEYS_HANDLED = new Set([
  'locate',
  'autofix',
  'overlay',
  'sectionId',
  'ruleId',
  'severity',
]);

interface Evaluation {
  findings?: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
  recommendedAutofix?: unknown;
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function jsonResult(structured: Record<string, unknown>, text: string): ToolResult {
  return { content: [{ type: 'text', text }], structuredContent: structured };
}

function compactFinding(finding: Record<string, unknown>): Record<string, unknown> {
  const autofix = finding.autofix as { available?: boolean } | undefined;
  const out: Record<string, unknown> = {
    sectionId: finding.sectionId,
    ruleId: finding.ruleId,
    severity: finding.severity,
    autofixable: autofix?.available === true,
  };
  // Keep the short scalar hit details (page numbers, measured values, …);
  // drop geometry and nested blobs.
  for (const [key, value] of Object.entries(finding)) {
    if (FINDING_KEYS_HANDLED.has(key) || value === undefined) continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) out[key] = value;
  }
  return out;
}

function compactArtifact(artifact: Artifact): Record<string, unknown> {
  const { bucket: _bucket, key: _key, ...rest } = artifact;
  return rest;
}

function evaluationOf(report: Record<string, unknown> | null): Evaluation | null {
  return (report as { evaluation?: Evaluation } | null)?.evaluation ?? null;
}

const stepReport = (step: Step): Record<string, unknown> | null => {
  const output = (step.outputs ?? []).find((o) => o?.kind === 'report');
  const body = output?.body;
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
};

export interface FileChecks {
  /** The report the file's verdict rests on: the re-check of the fixed file when there is one. */
  final: Record<string, unknown> | null;
  /** The first preflight, of the file as uploaded. */
  initial: Record<string, unknown> | null;
  /** True when `final` is a re-check of the fixed file, not the upload's check. */
  rechecked: boolean;
  /** True when autofix ran on this file, so its output may differ from what `initial` describes. */
  autofixed: boolean;
}

/**
 * Which check describes a file. The API's results.preflight carries the FIRST
 * preflight, of the upload, while the task's outcome is the LAST verdict: the
 * re-check of the fixed file. Showing the first one's findings next to that
 * outcome made fixed problems look unfixed (transparent_background still
 * "reject" after background removal). The re-check's report rides on its step.
 */
export function fileChecks(job: Job, result: PreflightResult): FileChecks {
  const initial = (result.report as Record<string, unknown> | null) ?? null;
  const task = job.tasks?.find((t) => t.id === result.taskId);
  const steps = task?.steps ?? [];
  const autofixed = steps.some((s) => s.type === 'autofix' && s.status === 'done');
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!;
    if (step.type !== 'repreflight') continue;
    const report = stepReport(step);
    if (report && evaluationOf(report)) {
      return { final: report, initial, rechecked: true, autofixed };
    }
  }
  return { final: initial, initial, rechecked: false, autofixed };
}

const ruleIdsOf = (evaluation: Evaluation | null): string[] => [
  ...new Set(
    (evaluation?.findings ?? [])
      .map((f) => f.ruleId)
      .filter((id): id is string => typeof id === 'string'),
  ),
];

export function verdictText(job: Job, pending: boolean): string {
  if (pending) return `Job ${job.id} is still processing (status: ${job.status}).`;
  if (job.status === 'error') {
    return 'Processing failed — the file could not be checked. This is an execution error, not a verdict on the file.';
  }
  if (job.status === 'skipped') return 'Processing was skipped (unsupported for this file type).';
  switch (job.outcome) {
    case 'pass':
      return 'File is print-ready.';
    case 'warn':
      return 'File is usable with warnings — review the findings.';
    case 'fail':
      return 'Check completed successfully, but the file is NOT print-ready — see findings.';
    case 'fixed':
      return 'File had issues that were fixed automatically — use the fixed deliverable, not the original.';
    case 'unchanged':
      return 'Autofix ran but the file needed no changes.';
    case 'mixed':
      return 'Files in this job have differing verdicts — check each file.';
    default:
      return 'Completed (no verdict for this operation).';
  }
}

/**
 * Compact a job into what an agent needs: both axes, per-file evaluation
 * summaries, capped findings, and the (signed) deliverables. The raw report
 * never rides along — that's get_report territory.
 */
/** Every URL string in a result, through the rewriter; expiresIn follows rewritten links. */
function rewriteLinks(value: unknown, links: LinkRewriter): unknown {
  if (typeof value === 'string') return /^https:\/\//.test(value) ? links.rewrite(value) : value;
  if (Array.isArray(value)) return value.map((item) => rewriteLinks(item, links));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = rewriteLinks(item, links);
    const before = (value as Record<string, unknown>).downloadUrl;
    if (typeof before === 'string' && out.downloadUrl !== before && 'expiresIn' in out) {
      out.expiresIn = links.ttlSeconds;
    }
    return out;
  }
  return value;
}

const ttlText = (seconds: number) =>
  seconds >= 86_400
    ? `${Math.round(seconds / 86_400)} days`
    : `${Math.round(seconds / 3600)} hours`;

export function formatJobResult(run: RunOutcome, links?: LinkRewriter): ToolResult {
  const result = formatJobResultRaw(run, links);
  if (!links || !result.structuredContent) return result;
  return {
    ...result,
    structuredContent: rewriteLinks(result.structuredContent, links) as Record<string, unknown>,
  };
}

/**
 * Why a job errored before any file was processed, in words a chat can act on.
 * The API records it on job.summary (error, failedSources) when every source failed.
 */
function failureOf(
  job: Job,
): { reason: string; nextStep: string; failedSources: FailedSource[] } | null {
  const summary = job.summary;
  if (job.status !== 'error' || !summary?.error) return null;
  const failedSources = summary.failedSources ?? [];
  const reasons = failedSources.map((f) => f.error).join(' ');
  const nextStep =
    /URL not allowed|fetch \d{3}|host not found|ENOTFOUND|timed? ?out|fetch failed/i.test(reasons)
      ? 'Filecheck could not download the file from that link. Ask for a public link that downloads the file directly (for example a shared Dropbox or Google Drive link), then check it again. Links to private or internal addresses are never fetched.'
      : 'Ask the user to check the file or link, then submit it again.';
  return { reason: summary.error, nextStep, failedSources };
}

function formatJobResultRaw(run: RunOutcome, links?: LinkRewriter): ToolResult {
  const { job, pending } = run;
  const failure = pending ? null : failureOf(job);
  const verdict = failure
    ? `${verdictText(job, pending)} Reason: ${failure.reason}`
    : verdictText(job, pending);
  const structured: Record<string, unknown> = {
    jobId: job.id,
    status: job.status,
    outcome: job.outcome ?? null,
    verdict,
  };
  if (pending) {
    structured.pending = true;
    structured.nextStep = `Wait a few seconds, then call get_job with jobId "${job.id}". Do NOT submit the file again — the job is already running.`;
    return jsonResult(structured, `${verdict} ${structured.nextStep as string}`);
  }

  const notes: string[] = [];
  let findingsBudget = FINDINGS_LIMIT;
  let truncated = false;

  const preflights = job.results?.preflight ?? [];
  let rechecks = 0;
  let unrechecked = 0;
  if (preflights.length > 0) {
    structured.files = preflights.map((result) => {
      const file: Record<string, unknown> = {
        taskId: result.taskId,
        source: result.source,
        fileType: result.fileType,
        status: result.status,
        outcome: result.outcome ?? null,
      };
      const checks = fileChecks(job, result);
      const evaluation = evaluationOf(checks.final);
      if (checks.rechecked) {
        rechecks++;
        file.checkedFile = 'fixed';
        const before = evaluationOf(checks.initial);
        if (before) {
          file.initialCheck = {
            summary: before.summary,
            ruleIds: ruleIdsOf(before).slice(0, FINDINGS_LIMIT),
          };
        }
      } else if (checks.autofixed && evaluation) {
        unrechecked++;
        file.checkedFile = 'original';
      }
      if (!evaluation) {
        file.hasEvaluation = false;
        file.note =
          'No profile was applied, so there is no pass/fail evaluation — use get_report to inspect the raw report.';
        return file;
      }
      file.summary = evaluation.summary;
      const findings = evaluation.findings ?? [];
      const kept = findings.slice(0, Math.max(0, findingsBudget));
      findingsBudget -= kept.length;
      file.findings = kept.map(compactFinding);
      if (kept.length < findings.length) {
        file.findingsOmitted = findings.length - kept.length;
        truncated = true;
      }
      if (evaluation.recommendedAutofix) file.recommendedAutofix = evaluation.recommendedAutofix;
      return file;
    });
    if (rechecks > 0) {
      notes.push(
        'Findings are from the re-check of the fixed file (checkedFile: fixed); initialCheck lists what the original upload had.',
      );
    }
    if (unrechecked > 0) {
      notes.push(
        'Findings marked checkedFile: original describe the upload BEFORE autofix, not the fixed deliverable. Run fix_file with repreflight:true to check the fixed file.',
      );
    }
    if (truncated) {
      structured.findingsTruncated = true;
      notes.push('Findings were capped — use get_report for the full list.');
    }
  }

  const validates = job.results?.validate ?? [];
  if (validates.length > 0) {
    structured.validate = validates.map((result) => ({
      taskId: result.taskId,
      source: result.source,
      status: result.status,
      outcome: result.outcome ?? null,
      compliant: result.compliant,
      profiles: result.profiles.map((profile) => ({
        requested: profile.requested,
        matched: profile.matched,
        profileName: profile.profileName,
        compliant: profile.compliant,
        checks: profile.checks,
        rules: profile.rules,
        failureCount: profile.failures.length,
        failures: profile.failures.slice(0, 10),
      })),
    }));
  }

  const optimizes = job.results?.optimize ?? [];
  if (optimizes.length > 0) {
    structured.optimize = optimizes.map((result) => ({
      taskId: result.taskId,
      source: result.source,
      status: result.status,
      outcome: result.outcome ?? null,
      output: result.output
        ? {
            sizeBytes: result.output.sizeBytes,
            downloadUrl: result.output.downloadUrl,
            expiresIn: result.output.expiresIn,
            appliedFixes: result.output.appliedFixes,
            skippedFixes: result.output.skippedFixes,
          }
        : null,
    }));
  }

  const previews: Array<Record<string, unknown>> = [];
  for (const task of job.tasks) {
    for (const step of task.steps) {
      if (step.type !== 'previews' || !step.outputs?.length) continue;
      for (const output of step.outputs) {
        const pages = Array.isArray(output.pages) ? output.pages : [];
        previews.push({
          taskId: task.id,
          count: output.count,
          total: output.total,
          pages: pages.slice(0, PAGES_LIMIT),
          ...(pages.length > PAGES_LIMIT ? { pagesOmitted: pages.length - PAGES_LIMIT } : {}),
        });
      }
    }
  }
  if (previews.length > 0) structured.previews = previews;

  if (job.deliverables.length > 0) {
    structured.deliverables = job.deliverables.map(compactArtifact);
    notes.push(
      links
        ? `${job.deliverables.length} deliverable(s); download links last ${ttlText(links.ttlSeconds)} — call get_job again after that for new ones.`
        : `${job.deliverables.length} deliverable(s); download URLs expire in ~60 minutes — re-call get_job for fresh ones.`,
    );
  }

  if (failure) {
    structured.error = failure.reason;
    if (failure.failedSources.length) {
      structured.failedSources = failure.failedSources.map(({ index, source, fileRef, error }) => ({
        index,
        source,
        fileRef,
        error,
      }));
    }
    structured.nextStep = failure.nextStep;
    notes.push(failure.nextStep);
  }

  const text = [
    `${verdict} (status: ${job.status}, outcome: ${job.outcome ?? 'n/a'}, jobId: ${job.id})`,
    ...notes,
  ].join(' ');
  return jsonResult(structured, text);
}

export function toolErrorResult(error: unknown): ToolResult {
  return { content: [{ type: 'text', text: errorText(error) }], isError: true };
}

/** The API's machine-readable parts: `code`, the field at fault (`param`), every problem (`details`). */
function apiDetails(error: FilecheckError): string {
  const body = error.body as { code?: unknown; param?: unknown; details?: unknown } | undefined;
  if (!body || typeof body !== 'object') return '';
  const parts = [
    typeof body.code === 'string' ? `code: ${body.code}` : null,
    typeof body.param === 'string' ? `field: ${body.param}` : null,
    body.details !== undefined ? `details: ${JSON.stringify(body.details).slice(0, 8_000)}` : null,
  ].filter(Boolean);
  return parts.length ? `\n${parts.join('\n')}` : '';
}

function errorText(error: unknown): string {
  if (error instanceof AuthenticationError) {
    if (error.status === 403) {
      return `Forbidden: ${error.message}. A 403 usually means the fileRef was uploaded with a different API key — re-upload the file with this key and use the new fileRef.`;
    }
    return `Authentication failed: ${error.message}. Check the API key (FILECHECK_API_KEY for the local server, the Authorization header for the remote one) — it must be an active sk_… secret key. A connected app (ChatGPT, Claude) signs in again when the key it was approved with was revoked.`;
  }
  if (error instanceof InvalidRequestError) {
    return `Invalid request: ${error.message}${apiDetails(error)}`;
  }
  if (error instanceof NotFoundError) {
    return `Not found: ${error.message}. Check the id — jobs are also soft-deleted by delete_job and expire per retention.`;
  }
  if (error instanceof RateLimitError) {
    return `Rate limited: ${error.message}. Back off and retry.`;
  }
  if (error instanceof ConnectionError) {
    return `Network failure talking to the Filecheck API: ${error.message}. Retry once; if it persists, check connectivity.`;
  }
  if (error instanceof FilecheckError) {
    if (error.status === 402) {
      return `Submissions are paused for this account (billing): ${error.message}. Top up credit in the Filecheck dashboard, then retry.`;
    }
    return `Filecheck API error${error.status ? ` (${error.status})` : ''}: ${error.message}${apiDetails(error)}`;
  }
  return error instanceof Error ? error.message : String(error);
}
