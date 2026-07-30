import type {
  AppliedBinding,
  ConnectorConfig,
  DownloadPayload,
  ErrorPayload,
  FileSelectPayload,
  FilecheckIntakeElement,
  IntakeFacts,
  IntakeStatusPayload,
  IntakeUi,
  IntakeUiOverride,
  Presentation,
  ProofPayload,
} from 'filecheck-js';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useFilecheck } from './FilecheckProvider.js';
import { useLatestRef } from './useLatestRef.js';

export interface FilecheckIntakeProps {
  /** Workflow to run the intake through. Mutable — applied via `update()`. */
  workflowId?: string;
  /** Existing job to resume. Identity prop — changing it recreates the element. */
  jobId?: string;
  /** Identity prop — changing it recreates the element. */
  presentation?: Presentation;
  /** Mutable — applied via `update()`. */
  locale?: string | null;
  /** Mutable — applied via `update()` (compared by value, inline literals are fine). */
  ui?: IntakeUiOverride;
  /** Mutable — applied via `setConnector()` without recreating. */
  connector?: ConnectorConfig | null;
  /** Identity prop — changing it recreates the element. */
  connectorId?: string;
  /** Identity prop — changing it recreates the element. */
  preview?: boolean;
  /** Identity prop — compared by value; changing it recreates the element. */
  workflow?: Record<string, unknown>;

  onReady?: (payload: { ui: IntakeUi }) => void;
  onStatus?: (payload: IntakeStatusPayload) => void;
  onFacts?: (payload: IntakeFacts) => void;
  onUi?: (payload: IntakeUi) => void;
  onError?: (payload: ErrorPayload) => void;
  onProof?: (payload: ProofPayload) => void;
  onFileSelect?: (payload: FileSelectPayload) => void;
  onDownload?: (payload: DownloadPayload) => void;
  onDestroy?: () => void;
  onConnectorApply?: (results: AppliedBinding[]) => void;

  id?: string;
  className?: string;
  style?: CSSProperties;
}

export interface FilecheckIntakeRef {
  /** The live element instance, or null before mount / after unmount. */
  readonly element: FilecheckIntakeElement | null;
  focus(): void;
  blur(): void;
  respondToProof(approved: boolean): void;
}

interface AppliedMutable {
  uiKey: string | undefined;
  locale: string | null | undefined;
  workflowId: string | undefined;
}

function stableKey(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}

/**
 * Renders a slot `<div>` and mounts a Filecheck intake element into it.
 *
 * - Identity props (`jobId`, `presentation`, `connectorId`, `preview`,
 *   `workflow`) recreate the element when they change; element instances are
 *   single-use by design.
 * - Mutable props (`ui`, `locale`, `workflowId`) are pushed through
 *   `element.update()`; `connector` through `element.setConnector()`.
 * - Callback props use the latest-ref pattern: passing inline functions is
 *   safe and never re-subscribes or recreates.
 */
export const FilecheckIntake = forwardRef<FilecheckIntakeRef, FilecheckIntakeProps>(
  function FilecheckIntake(props, ref) {
    const fc = useFilecheck();
    const domRef = useRef<HTMLDivElement | null>(null);
    const elementRef = useRef<FilecheckIntakeElement | null>(null);
    const appliedRef = useRef<AppliedMutable | null>(null);
    const propsRef = useLatestRef(props);

    const {
      workflowId,
      jobId,
      presentation,
      locale,
      ui,
      connector,
      connectorId,
      preview,
      workflow,
      id,
      className,
      style,
    } = props;

    const uiKey = stableKey(ui);
    const workflowKey = stableKey(workflow);
    const connectorKey = stableKey(connector);

    // Create + mount. Cleanup fully discards the instance, which makes the
    // effect safe under React 18 StrictMode's double-invoke.
    // biome-ignore lint/correctness/useExhaustiveDependencies: identity props only — mutable props flow through update()/setConnector() below, and creation-time values are read from propsRef.
    useEffect(() => {
      if (!fc || !domRef.current) return;
      const p = propsRef.current;

      const element = fc.elements.create('intake', {
        workflowId: p.workflowId,
        jobId: p.jobId,
        presentation: p.presentation,
        locale: p.locale,
        ui: p.ui,
        connector: p.connector ?? undefined,
        connectorId: p.connectorId,
        preview: p.preview,
        workflow: p.workflow,
        onConnectorApply: (results) => propsRef.current.onConnectorApply?.(results),
      });

      // Subscribe before mount so `ready` can never be missed.
      element.on('ready', (payload) => propsRef.current.onReady?.(payload));
      element.on('status', (payload) => propsRef.current.onStatus?.(payload));
      element.on('facts', (payload) => propsRef.current.onFacts?.(payload));
      element.on('ui', (payload) => propsRef.current.onUi?.(payload));
      element.on('error', (payload) => propsRef.current.onError?.(payload));
      element.on('proof', (payload) => propsRef.current.onProof?.(payload));
      element.on('fileSelect', (payload) => propsRef.current.onFileSelect?.(payload));
      element.on('download', (payload) => propsRef.current.onDownload?.(payload));
      element.on('destroy', () => propsRef.current.onDestroy?.());

      element.mount(domRef.current);
      elementRef.current = element;
      appliedRef.current = {
        uiKey: stableKey(p.ui),
        locale: p.locale,
        workflowId: p.workflowId,
      };

      return () => {
        elementRef.current = null;
        appliedRef.current = null;
        // unmount() clears all listeners; no manual off() needed.
        element.unmount();
      };
    }, [fc, jobId, presentation, connectorId, preview, workflowKey]);

    // Mutable props → update(). Compares against what the element last
    // received so the run right after creation is a no-op.
    // biome-ignore lint/correctness/useExhaustiveDependencies: ui is compared via its serialized key.
    useEffect(() => {
      const element = elementRef.current;
      const applied = appliedRef.current;
      if (!element || !applied) return;

      const patch: { ui?: IntakeUiOverride; locale?: string | null; workflowId?: string } = {};
      if (uiKey !== applied.uiKey && ui !== undefined) patch.ui = ui;
      if (locale !== applied.locale && locale !== undefined) patch.locale = locale;
      if (workflowId !== applied.workflowId && workflowId !== undefined) {
        patch.workflowId = workflowId;
      }
      if (Object.keys(patch).length === 0) return;

      element.update(patch);
      appliedRef.current = { uiKey, locale, workflowId };
    }, [uiKey, locale, workflowId]);

    // connector → setConnector() (never recreates). The creation effect
    // already passed the initial connector, so skip until it changes.
    const initialConnectorKey = useRef(connectorKey);
    // biome-ignore lint/correctness/useExhaustiveDependencies: connector is compared via its serialized key.
    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;
      if (connectorKey === initialConnectorKey.current) return;
      initialConnectorKey.current = connectorKey;
      element.setConnector(connector ?? null);
    }, [connectorKey]);

    useImperativeHandle(
      ref,
      () => ({
        get element() {
          return elementRef.current;
        },
        focus: () => elementRef.current?.focus(),
        blur: () => elementRef.current?.blur(),
        respondToProof: (approved: boolean) => elementRef.current?.respondToProof(approved),
      }),
      [],
    );

    return <div ref={domRef} id={id} className={className} style={style} />;
  },
);
