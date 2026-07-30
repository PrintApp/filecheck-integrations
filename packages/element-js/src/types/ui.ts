/**
 * Vendored from filecheck/packages/element/src/types/ui.ts @ 17ecc91.
 * Do not edit by hand without checking upstream — run `pnpm sync:types`.
 *
 * Presentational config for the Filecheck Element. The element receives the
 * fully-resolved object from the iframe after init (defaults ← domain.ui ←
 * rule.ui ← host overrides) and reflects subsequent `update()` calls back
 * through it.
 */
export type IntakeTheme = 'light' | 'dark' | 'system';
export type IntakeLayout = 'inline' | 'modal' | 'drawer' | 'compact';
export type IntakeBranding = 'domain' | 'none' | 'custom';

/**
 * How the intake renders per-file results.
 *   - 'full' — inline issue text + fix descriptions per file (default).
 *   - 'list' — compact file queue; rows are selectable and emit `fileSelect`
 *     so the host can drive a report element alongside.
 */
export type IntakeResultsDisplay = 'full' | 'list';

export interface IntakeUi {
  title: string;
  subtitle: string;
  theme: IntakeTheme;
  accent: string | null;
  locale: string | null;
  layout: IntakeLayout;
  showHeader: boolean;
  showHelp: boolean;
  helpText: string;
  submitLabel: string;
  autoSubmit: boolean;
  branding: IntakeBranding;
  resultsDisplay: IntakeResultsDisplay;
}

/** Partial override accepted from host code at mount/update time. */
export type IntakeUiOverride = Partial<IntakeUi>;
