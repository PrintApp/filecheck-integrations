/**
 * Vendored from filecheck/packages/element/src/types/report.ts @ 17ecc91.
 * Do not edit by hand without checking upstream — run `pnpm sync:types`.
 *
 * Normalized per-file report entry — the shape the report viewer renders and
 * the shape the intake's `fileSelect` event delivers in its `report` field.
 *
 * Hosts should treat this as an opaque hand-off: take it from `fileSelect`
 * and pass it to a report element's `data` option (or `update({ data })`).
 * Hand-authoring entries is possible but unsupported — the nested
 * `preflight` / `profiles` / `proof` bodies follow internal schemas that may
 * gain fields in minor releases.
 */
export interface ReportFileData {
  /** Task id — matches the `fileId` carried by `fileSelect`. */
  id?: string;
  /** Artifact key of the task's output (or input) file. */
  fileId?: string;
  name?: string;
  icon?: string;
  outcome?: 'pass' | 'warn' | 'fail' | null;
  sourceKey?: string;
  sourceSize?: number | null;
  downloadable?: boolean;
  /**
   * Presigned GET for the fixed file, minted by the intake at selection
   * time. Short-lived — a fresh `fileSelect` (row click) re-mints it.
   */
  downloadUrl?: string | null;
  /** Raw preflight report body (snake_case schema). */
  preflight?: Record<string, unknown> | null;
  /** Flattened validation profile rows. */
  profiles?: unknown[] | null;
  /** Soft-proof page lists: { before?, after? }. */
  proof?: Record<string, unknown> | null;
  meta?: Record<string, unknown>;
}
