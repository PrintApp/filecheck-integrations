/**
 * Vendored from filecheck/packages/element/src (Filecheck.ts, Elements.ts,
 * Element.ts, elements/IntakeElement.ts, elements/ReportElement.ts,
 * bootstrap.ts, iife.ts) @ 17ecc91 — public surface as interfaces only.
 * Do not edit by hand without checking upstream — run `pnpm sync:types`.
 *
 * Note: element instances are modeled as interfaces (not the upstream
 * classes) so this package ships zero Element runtime. `update()` is
 * narrowed per element type — upstream declares it on the base class with
 * the union of intake + report fields, so e.g. `intake.update({
 * canDownload: true })` type-checks upstream but silently does nothing;
 * these types encode the intended per-element surface instead.
 */
import type { AppliedBinding, ConnectorConfig } from './connector.js';
import type { ElementEventHandler, ElementEventName } from './events.js';
import type { ReportFileData } from './report.js';
import type { IntakeUiOverride } from './ui.js';

/**
 * How the host integrator is presenting the element on the page.
 *   - 'inline' — embedded directly in the page flow (default).
 *   - 'dialog' — mounted inside a host-owned overlay/<dialog>/drawer.
 */
export type Presentation = 'inline' | 'dialog';

/** Options every element type accepts. */
export interface BaseElementOptions {
  /** Override the resolved locale (BCP-47). */
  locale?: string | null;
  /** Per-element UI overrides (highest precedence in the resolver). */
  ui?: IntakeUiOverride;
  /** How the host is presenting this element. Defaults to 'inline'. */
  presentation?: Presentation;
}

export interface IntakeElementOptions extends BaseElementOptions {
  /**
   * ID of the Filecheck workflow to run this intake through. Ignored when
   * `jobId` is also provided.
   */
  workflowId?: string;
  /**
   * ID of an existing job to resume. When set, the client loads the job and
   * uses the workflow/rule that job was created against; any `workflowId`
   * supplied alongside is ignored.
   */
  jobId?: string;
  /**
   * Mark this element as a preview session: webhooks suppressed, usage
   * unmetered, jobs excluded from the main activity feed.
   */
  preview?: boolean;
  /**
   * Connector that maps upload facts (page count, dimensions, area) onto the
   * host page's own product controls. Applied to the host DOM on every
   * status update — no host code required.
   */
  connector?: ConnectorConfig;
  /** ID of a stored connector (resolved server-side). */
  connectorId?: string;
  /**
   * Inline workflow object for transient (unsaved) previews. When present,
   * `workflowId` is ignored. Must contain at least `{ rule }`.
   */
  workflow?: Record<string, unknown>;
  /** Called after each connector apply pass with a per-binding report. */
  onConnectorApply?: (results: AppliedBinding[]) => void;
}

export interface ReportElementOptions extends BaseElementOptions {
  /** ID of the job whose report to render. Required unless `data` is supplied. */
  jobId?: string;
  /** Short-lived read token scoped to `jobId`, for public embeds. */
  token?: string;
  /**
   * Host gate for the download affordance. When false the report only emits
   * the `download` event and never downloads itself. Defaults to true.
   */
  canDownload?: boolean;
  /**
   * Scope the report to a single file of the job — the task id delivered by
   * the intake's `fileSelect` event. Omit to render the whole job.
   */
  fileId?: string;
  /**
   * Data mode: render host-supplied normalized report entries directly — no
   * socket, no job fetch. Take the entry from `fileSelect`'s `report` field.
   */
  data?: ReportFileData[];
}

/** Fields an intake element's `update()` accepts. */
export interface IntakeUpdatePayload {
  ui?: IntakeUiOverride;
  locale?: string | null;
  presentation?: Presentation;
  workflowId?: string | null;
  jobId?: string | null;
}

/** Fields a report element's `update()` accepts. */
export interface ReportUpdatePayload {
  ui?: IntakeUiOverride;
  locale?: string | null;
  presentation?: Presentation;
  jobId?: string | null;
  token?: string | null;
  canDownload?: boolean;
  fileId?: string | null;
  data?: ReportFileData[] | null;
}

/**
 * Public surface shared by every element instance. Instances are single-use:
 * after `unmount()` they cannot be remounted — create a new element instead.
 */
export interface FilecheckElementBase<TUpdate> {
  /** Unique element instance id. */
  readonly id: string;
  /** Element type discriminator ('intake' | 'report'). */
  readonly type: string;
  /**
   * Mount into a CSS selector or DOM element. Throws if the target is not
   * found or the element is already mounted.
   */
  mount(target: string | globalThis.Element): this;
  /** Push a partial update to the running iframe. */
  update(patch: TUpdate): this;
  focus(): void;
  blur(): void;
  /** Answer a proof approval gate (see the `proof` event). */
  respondToProof(approved: boolean): void;
  /** Tear down the iframe and emit `destroy`. The instance is spent. */
  unmount(): void;
  /** Subscribe to a typed event. Returns an unsubscribe function. */
  on<K extends ElementEventName>(event: K, handler: ElementEventHandler<K>): () => void;
  off<K extends ElementEventName>(event: K, handler: ElementEventHandler<K>): void;
}

export interface FilecheckIntakeElement extends FilecheckElementBase<IntakeUpdatePayload> {
  readonly type: 'intake';
  /**
   * Replace the active connector at runtime. Re-applies immediately against
   * the most recent facts, if any.
   */
  setConnector(connector: ConnectorConfig | null): this;
  /** Re-run the connector applier against the last known facts. */
  applyNow(): AppliedBinding[];
}

export interface FilecheckReportElement extends FilecheckElementBase<ReportUpdatePayload> {
  readonly type: 'report';
}

export interface FilecheckElements {
  create(type: 'intake', options?: IntakeElementOptions): FilecheckIntakeElement;
  create(type: 'report', options: ReportElementOptions): FilecheckReportElement;
}

export interface FilecheckInstance {
  readonly elements: FilecheckElements;
}

/** Options accepted by the `Filecheck()` factory. */
export interface FilecheckOptions {
  /**
   * Optional sub-tenant scope, passed through to the iframe handshake.
   * (Semantics are still being finalized upstream — currently inert.)
   */
  agentId?: string | null;
  /** Override the iframe URL (staging / local dev). Internal use. */
  iframeSrc?: string;
}

/**
 * Declarative config consumed by the CDN global's static
 * `Filecheck.mount(config)` — the zero-JS bootstrap path. Distinct from
 * `elements.create()` options.
 */
export interface FilecheckElementConfig {
  /** Tenant publishable key. Required. */
  publishableKey?: string;
  /** Workflow assigned to the product/dropzone. */
  workflowId?: string;
  /** Existing job id to resume; `workflowId` is then ignored. */
  jobId?: string;
  agentId?: string | null;
  /** Override the iframe URL (staging / local dev). */
  iframeSrc?: string;
  /** 'inline' (default) embeds in the page; 'dialog' opens in a dialog. */
  presentation?: Presentation;
  /** Fallback host selector to mount into (used when #fc-inline missing). */
  mountSelector?: string;
  /** If set, the mount/trigger is inserted before this element. */
  moveMountBefore?: string;
  /** Extra cart-button selector(s), appended to the built-in list. */
  cartButtonSelector?: string;
  /** Reserved — variant tracking. */
  customVariantSelector?: string;
  /** Theme hint forwarded to the iframe via `ui`. */
  elementTheme?: 'light' | 'dark' | 'system';
  /** Language code forwarded to the iframe (e.g. 'en', 'de'). */
  langCode?: string;
  /** CSS injected into the host page <head>. */
  customCss?: string;
  /** JS evaluated in the host page after mount. */
  customJs?: string;
  /** Connector id — resolved via the API. */
  connectorId?: string;
  /** Mark this as a preview / demo session. */
  preview?: boolean;
}

/**
 * The CDN global (`window.Filecheck`): the callable factory plus the static
 * `mount()` helper added by the IIFE bundle. Note the CDN global also
 * auto-wires the built-in proof gallery on every intake it creates.
 */
export interface FilecheckStatic {
  (publishableKey: string, options?: FilecheckOptions): FilecheckInstance;
  /** Zero-JS bootstrap: create + mount an intake from a declarative config. */
  mount(config: FilecheckElementConfig): FilecheckIntakeElement | undefined;
}
