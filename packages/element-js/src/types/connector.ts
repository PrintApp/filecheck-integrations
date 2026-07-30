/**
 * Vendored from filecheck/packages/element/src/types/connector.ts and
 * src/dom/connector.ts @ 17ecc91 — TYPES ONLY. The upstream runtime helpers
 * (CONTROL_PRESETS, UNIT_MM, resolveBindingValue, selectorsFor) live inside
 * the CDN bundle and are not reachable through `window.Filecheck`, so they
 * are deliberately not re-exported here.
 * Do not edit by hand without checking upstream — run `pnpm sync:types`.
 */

/** Facts a binding can read FROM the upload (see IntakeFacts.aggregate). */
export type ConnectorSource =
  | 'pageCount'
  | 'fileCount'
  | 'colorPageCount'
  | 'monoPageCount'
  | 'width'
  | 'height'
  | 'area';

/** Semantic host control a binding drives. */
export type ConnectorControl = 'quantity' | 'width' | 'height' | 'area';

/** How the resolved value is written into the matched host element. */
export type ConnectorSetMode = 'value' | 'text' | 'attr';

/** A single facts→control mapping. */
export interface ConnectorBinding {
  id: string;
  enabled?: boolean;
  source: ConnectorSource;
  control?: ConnectorControl | null;
  customSelector?: string;
  set?: ConnectorSetMode;
  attr?: string | null;
  emit?: string[];
  convertFrom?: number | string;
  convertTo?: number | string;
  decimals?: number | null;
  round?: 'round' | 'floor' | 'ceil';
}

/** A standalone connector config, as authored in admin. */
export interface ConnectorConfig {
  id?: string;
  title?: string;
  enabled?: boolean;
  bindings: ConnectorBinding[];
}

/** Per-binding result of a connector apply pass (see `onConnectorApply`). */
export interface AppliedBinding {
  bindingId: string;
  selector: string | null;
  value: number | null;
  applied: boolean;
  reason?: string;
}

/** Per-file facts (mm for dimensions, mm² for area). */
export interface FileFacts {
  id: string | null;
  name: string | null;
  pageCount: number | null;
  /** Pages with any C/M/Y or spot ink. Null when no ink data was measured. */
  colorPageCount: number | null;
  /** K-only pages (c=m=y=0, no spots). Null when no ink data was measured. */
  monoPageCount: number | null;
  width: number | null;
  height: number | null;
  area: number | null;
  orientation: string | null;
  spotColorCount: number;
  usesTransparency: boolean;
}

/** Upload-level facts projection delivered on every `status` event. */
export interface IntakeFacts {
  files: FileFacts[];
  aggregate: {
    fileCount: number;
    pageCount: number;
    /** Sum across files with ink data; null when none have it. */
    colorPageCount: number | null;
    /** Sum across files with ink data; null when none have it. */
    monoPageCount: number | null;
    width: number | null;
    height: number | null;
    area: number | null;
  };
}
