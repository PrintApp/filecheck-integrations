/**
 * Vendored from filecheck/packages/element/src/types/intake.ts @ 17ecc91.
 * Do not edit by hand without checking upstream — run `pnpm sync:types`.
 *
 * Deliberate deviation from upstream: `IntakeFile.status` is typed
 * `string | null` here because the iframe's jobService emits
 * `t?.status || null` at runtime even though upstream declares `string`.
 */
import type { IntakeFacts } from './connector.js';

export type IntakeStatus =
  | 'idle'
  | 'incomplete'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'partial'
  | 'rejected';

/**
 * Terminal statuses — the intake will not transition again until the host
 * resets or supplies new files.
 */
export const INTAKE_TERMINAL: ReadonlySet<IntakeStatus> = new Set<IntakeStatus>([
  'ready',
  'partial',
  'rejected',
]);

/** Per-file summary delivered alongside every status update. */
export interface IntakeFile {
  id: string;
  name: string;
  fileRef: string | null;
  outcome: 'pass' | 'warn' | 'fail' | null;
  status: string | null;
  outputRef: string | null;
}

/**
 * Payload of a `status` event.
 *
 * `canProceed` is the single signal a host needs to gate downstream UI
 * (e.g. an "Add to Cart" button). It is derived inside the iframe from the
 * resolved intake status, which already factors in the rule's
 * `policy.onFail`:
 *
 *   - `ready`   → true   (all files passed)
 *   - `partial` → true   (warnings only, or fails accepted by policy)
 *   - any other → false  (idle / uploading / processing / rejected / …)
 *
 * Hosts should treat `canProceed` as authoritative and never re-derive it
 * from `status` or `files`.
 */
export interface IntakeStatusPayload {
  status: IntakeStatus;
  terminal: boolean;
  canProceed: boolean;
  workflowId: string | null;
  jobId: string | null;
  files: IntakeFile[];
  /**
   * Normalised, host-facing projection of what Filecheck learned about the
   * upload (page count, first-file dimensions in mm, area). Present once at
   * least one file has been inspected.
   */
  facts?: IntakeFacts;
}
