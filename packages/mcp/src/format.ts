import {
  AuthenticationError,
  ConnectionError,
  FilecheckError,
  InvalidRequestError,
  NotFoundError,
  RateLimitError,
} from 'filecheck-node';
import type { Artifact, Job, PreflightResult } from 'filecheck-node';
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

function evaluationOf(result: PreflightResult): Evaluation | null {
  const report = result.report as { evaluation?: Evaluation } | null;
  return report?.evaluation ?? null;
}

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
export function formatJobResult(run: RunOutcome): ToolResult {
  const { job, pending } = run;
  const verdict = verdictText(job, pending);
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
  if (preflights.length > 0) {
    structured.files = preflights.map((result) => {
      const file: Record<string, unknown> = {
        taskId: result.taskId,
        source: result.source,
        fileType: result.fileType,
        status: result.status,
        outcome: result.outcome ?? null,
      };
      const evaluation = evaluationOf(result);
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
      `${job.deliverables.length} deliverable(s); download URLs expire in ~60 minutes — re-call get_job for fresh ones.`,
    );
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

function errorText(error: unknown): string {
  if (error instanceof AuthenticationError) {
    if (error.status === 403) {
      return `Forbidden: ${error.message}. A 403 usually means the fileRef was uploaded with a different API key — re-upload the file with this key and use the new fileRef.`;
    }
    return `Authentication failed: ${error.message}. Check the API key (FILECHECK_API_KEY for the local server, the Authorization header for the remote one) — it must be an active sk_… secret key.`;
  }
  if (error instanceof InvalidRequestError) {
    return `Invalid request: ${error.message}`;
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
    return `Filecheck API error${error.status ? ` (${error.status})` : ''}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
