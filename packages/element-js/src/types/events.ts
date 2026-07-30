/**
 * Vendored from filecheck/packages/element/src/types/events.ts and the
 * iframe→host payload types in src/transport/protocol.ts @ 17ecc91.
 * Do not edit by hand without checking upstream — run `pnpm sync:types`.
 *
 * Deliberate deviations from upstream (matching observed runtime behavior):
 *   - `ProofPayload.message` / `affirmButtonText` allow explicit `null`
 *     (the client sends null, upstream types say string | undefined).
 *   - `ProofPage` metadata fields are optional — the client tolerates a
 *     legacy bare-string page list mapped to `{ url, page }` only.
 */
import type { IntakeFacts } from './connector.js';
import type { IntakeStatusPayload } from './intake.js';
import type { ReportFileData } from './report.js';
import type { IntakeUi } from './ui.js';

/** Recoverable error surfaced by the iframe. */
export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ProofPage {
  url: string;
  page: number;
  width?: number;
  height?: number;
  mimeType?: string;
  bytes?: number;
  key?: string;
}

export interface ProofPayload {
  /** Ordered array of rendered page images. */
  pages: ProofPage[];
  /**
   * When true the gallery presents an approval gate: a message banner and an
   * affirmative button. Approving sends a proof decision back
   * (`element.respondToProof(true)`).
   */
  approvalRequired?: boolean;
  /** Message shown above the proof when `approvalRequired` is set. */
  message?: string | null;
  /** Label for the approve button. Defaults to "Approve". */
  affirmButtonText?: string | null;
}

/**
 * Report element only. Emitted when the user requests a download while the
 * host has gated it (or always, so the host can handle/track downloads
 * itself). `fileId` is the artifact key / task id the report offered.
 */
export interface DownloadPayload {
  fileId: string;
}

/**
 * Intake element only, list mode (`ui.resultsDisplay: 'list'`). Emitted when
 * the user clicks a file row, and once automatically when the first file
 * reaches a terminal outcome. `fileId` is the file's task id — pass it to a
 * report element (`fileId` option / `update({ fileId })`) to scope the
 * report to that file.
 */
export interface FileSelectPayload {
  jobId: string | null;
  fileId: string;
  outcome: string | null;
  /**
   * Normalized report entry for the selected file — feed it straight to a
   * report element's `data` option for a socket-free, fetch-free report.
   */
  report: ReportFileData | null;
}

/**
 * Public event map. Element instances are typed event emitters over this:
 *
 *   element.on('status', (e) => …);  // e is IntakeStatusPayload
 *
 * `on()` returns an unsubscribe function.
 */
export interface ElementEventMap {
  /** Iframe finished bootstrapping and is ready for interaction. */
  ready: { ui: IntakeUi };

  /** Intake status changed. Fires on every transition, including terminal. */
  status: IntakeStatusPayload;

  /** Resolved UI descriptor changed (theme switch, host update(), etc.). */
  ui: IntakeUi;

  /**
   * Normalised file facts changed (page count, dimensions, area). Fired
   * whenever a `status` update carries a fresh facts projection.
   */
  facts: IntakeFacts;

  /** Recoverable error surfaced by the iframe. */
  error: ErrorPayload;

  /** Proof pages are ready for display. */
  proof: ProofPayload;

  /** Report element only. Fired when the user requests a download. */
  download: DownloadPayload;

  /** Intake element only, list mode. Fired when the user selects a file. */
  fileSelect: FileSelectPayload;

  /** Element was unmounted. No further events will fire after this. */
  destroy: void;
}

export type ElementEventName = keyof ElementEventMap;

export type ElementEventHandler<K extends ElementEventName> = ElementEventMap[K] extends void
  ? () => void
  : (payload: ElementEventMap[K]) => void;
