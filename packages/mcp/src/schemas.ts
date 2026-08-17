import { z } from 'zod';
import type { Capabilities } from './capabilities.js';

/**
 * Shared zod fragments for tool input schemas. Kept aligned with the API's
 * JSON schemas (`filecheck-api/_layers/mixins/nodejs/schemas/*.json`).
 */

export interface SourceInput {
  filePath?: string;
  url?: string;
  fileRef?: string;
  headers?: Record<string, string>;
  name?: string;
}

/**
 * The file to process. Exactly one of the locator fields must be set —
 * enforced in `resolveSource` (a refine would not survive JSON-schema
 * conversion, and the runtime error message is clearer).
 */
export function makeSourceSchema(caps: Capabilities) {
  const shape: Record<string, z.ZodTypeAny> = {
    url: z
      .string()
      .regex(/^https?:\/\//, 'must be an http(s) URL')
      .optional()
      .describe('Public (or header-authenticated) URL to fetch the file from.'),
    fileRef: z
      .string()
      .regex(/^upload_/, 'must start with "upload_"')
      .optional()
      .describe('An `upload_…` reference from a previous upload with this same API key.'),
    headers: z
      .record(z.string())
      .optional()
      .describe('Extra HTTP headers sent when fetching `url` (e.g. Authorization).'),
    name: z.string().optional().describe('Original filename hint.'),
  };
  if (caps.localFiles) {
    shape.filePath = z
      .string()
      .optional()
      .describe('Absolute path to a file on the local machine (uploaded for you; max 200 MB).');
  }
  const which = caps.localFiles ? '`filePath`, `url`, or `fileRef`' : '`url` or `fileRef`';
  const remoteHint = caps.localFiles
    ? ''
    : ' For files on the local machine, run the local server instead: `npx filecheck-mcp`.';
  return z.object(shape).describe(`The file to process. Set exactly one of ${which}.${remoteHint}`);
}

const bounded = (min: number, max: number) => z.number().int().min(min).max(max);

export const contextSchema = z
  .object({
    artworkSize: z
      .object({
        width_mm: z.number().positive().max(100_000),
        height_mm: z.number().positive().max(100_000),
      })
      .optional()
      .describe(
        'Finished (trim) size of the product ordered. Both dimensions are required for the page-size check to take effect.',
      ),
    pageCount: z
      .object({ min: bounded(0, 10_000).optional(), max: bounded(0, 10_000).optional() })
      .optional()
      .describe(
        'Expected page count. Set min === max for an exact count (a double-sided card is 2).',
      ),
    fileCount: z
      .object({ min: bounded(0, 100).optional(), max: bounded(0, 100).optional() })
      .optional()
      .describe('Expected number of separate files. NOT the order quantity.'),
    bleed: z
      .object({ required_mm: z.number().min(0).max(500) })
      .optional()
      .describe(
        'Bleed the chosen finish requires (a hemmed banner needs more than a trimmed card).',
      ),
    safety: z
      .object({ min_mm: z.number().min(0).max(500) })
      .optional()
      .describe('Safe margin the chosen finish requires (eyelets and pole pockets eat into it).'),
  })
  .describe(
    'What the customer ordered — finished size, pages, finish. Narrows the resolved profile to the ordered product, so one profile serves every size. Only tightens checks the profile already has enabled; no effect without a profileId. Pass it whenever the product dimensions are known.',
  );

export const waitSecondsSchema = z
  .number()
  .int()
  .min(0)
  .max(600)
  .optional()
  .describe(
    'Max seconds to wait for the job to finish before returning a pending result (capped by the server; 0 = return immediately). Omit for the default budget.',
  );

/**
 * Output shape shared by every job-returning tool. Deliberately permissive —
 * the SDK validates structuredContent against this, and the API may grow
 * fields; enums are documented in descriptions instead of enforced.
 */
export const jobOutputShape = {
  jobId: z.string(),
  status: z
    .string()
    .describe(
      'Execution lifecycle: pending | running | done | skipped | error. Says nothing about the verdict.',
    ),
  outcome: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Verdict: pass | warn | fail | fixed | unchanged | na | mixed. Independent of status — status:done + outcome:fail means "checked successfully, file is NOT print-ready".',
    ),
  pending: z
    .boolean()
    .optional()
    .describe('True when the job has not reached a terminal status yet.'),
  verdict: z.string().describe('Human-readable one-line verdict.'),
  files: z
    .array(z.object({}).passthrough())
    .optional()
    .describe('Per-file preflight results: summary, capped findings, recommended autofix.'),
  validate: z
    .array(z.object({}).passthrough())
    .optional()
    .describe('PDF/A / PDF/UA conformance results.'),
  optimize: z.array(z.object({}).passthrough()).optional().describe('Optimization results.'),
  previews: z.array(z.object({}).passthrough()).optional().describe('Rendered page previews.'),
  deliverables: z
    .array(z.object({}).passthrough())
    .optional()
    .describe(
      'Final file set. downloadUrl expires in ~60 minutes — re-call get_job for fresh URLs, never store them.',
    ),
  findingsTruncated: z
    .boolean()
    .optional()
    .describe('True when findings were capped; use get_report for the rest.'),
  nextStep: z
    .string()
    .optional()
    .describe('Present when action is needed (e.g. poll get_job). Follow it.'),
};
