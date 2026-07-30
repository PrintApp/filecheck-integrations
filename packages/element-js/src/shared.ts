import type { FilecheckInstance, FilecheckOptions, FilecheckStatic } from './types/index.js';

declare global {
  interface Window {
    Filecheck?: FilecheckStatic;
  }
}

/**
 * Generic CDN bundle. Deliberately NOT the per-tenant
 * `…/element/{pk}/filecheck.js` form: that variant carries an edge-injected
 * `window.FILECHECK_CONFIG`, which triggers the bundle's auto-bootstrap and
 * would mount an element on its own — exactly what a programmatic consumer
 * of this loader does not want.
 */
export const DEFAULT_SCRIPT_URL = 'https://cdn.filecheck.io/element/v1/filecheck.js';

const SCRIPT_URL_PATTERN = /^https:\/\/cdn\.filecheck\.io\/element\/[^/]+\/filecheck\.js(\?.*)?$/;

const DEFAULT_LOAD_TIMEOUT_MS = 30_000;

export interface LoadFilecheckOptions extends FilecheckOptions {
  /** Override the CDN script URL (staging / self-hosted). */
  scriptUrl?: string;
  /** Reject if the script hasn't loaded after this many ms. 0 disables. Default 30 000. */
  loadTimeoutMs?: number;
}

let scriptPromise: Promise<FilecheckStatic> | null = null;

function findExistingScript(): HTMLScriptElement | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src]');
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    if (script && SCRIPT_URL_PATTERN.test(script.src)) return script;
  }
  return null;
}

function injectScript(url: string): HTMLScriptElement {
  const script = document.createElement('script');
  script.src = url;
  script.async = true;
  const parent = document.head || document.body;
  if (!parent) {
    throw new Error('[filecheck] expected a <head> or <body> to inject the Filecheck script into');
  }
  parent.appendChild(script);
  return script;
}

function loadScript(url: string, timeoutMs: number): Promise<FilecheckStatic> {
  if (window.Filecheck) return Promise.resolve(window.Filecheck);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<FilecheckStatic>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      // Allow a later call to retry the load instead of caching the failure.
      scriptPromise = null;
      reject(error);
    };

    const succeed = (): void => {
      if (settled) return;
      if (!window.Filecheck) {
        fail(new Error('[filecheck] script loaded but window.Filecheck is not defined'));
        return;
      }
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve(window.Filecheck);
    };

    let script: HTMLScriptElement;
    try {
      script = findExistingScript() ?? injectScript(url);
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    // A pre-existing tag may already have finished loading.
    if (window.Filecheck) {
      succeed();
      return;
    }

    script.addEventListener('load', succeed);
    script.addEventListener('error', () => {
      fail(new Error(`[filecheck] failed to load the Filecheck script from ${script.src}`));
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        fail(new Error(`[filecheck] timed out after ${timeoutMs}ms loading ${script.src}`));
      }, timeoutMs);
    }
  });

  return scriptPromise;
}

/**
 * Load the Filecheck Element script from the CDN (once — concurrent and
 * repeated calls share one script tag) and initialise a Filecheck instance.
 *
 * Resolves `null` when called in a non-browser environment (SSR), matching
 * the Stripe.js convention, so it is safe to call unconditionally in
 * isomorphic code.
 */
export function loadFilecheck(
  publishableKey: string,
  options: LoadFilecheckOptions = {},
): Promise<FilecheckInstance | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);

  if (!publishableKey || typeof publishableKey !== 'string') {
    return Promise.reject(new Error('[filecheck] loadFilecheck requires a publishable key'));
  }

  const {
    scriptUrl = DEFAULT_SCRIPT_URL,
    loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
    ...factoryOptions
  } = options;

  return loadScript(scriptUrl, loadTimeoutMs).then((filecheck) =>
    filecheck(publishableKey, factoryOptions),
  );
}
