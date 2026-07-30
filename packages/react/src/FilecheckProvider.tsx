import type { FilecheckInstance } from 'filecheck-js';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type FilecheckProp = Promise<FilecheckInstance | null> | FilecheckInstance | null;

const FilecheckContext = createContext<FilecheckInstance | null | undefined>(undefined);
FilecheckContext.displayName = 'FilecheckContext';

function isPromise(value: FilecheckProp): value is Promise<FilecheckInstance | null> {
  return value !== null && typeof (value as { then?: unknown }).then === 'function';
}

export interface FilecheckProviderProps {
  /**
   * The result of `loadFilecheck(...)` — either the promise itself, an
   * already-resolved instance, or `null` (SSR). Passing the promise directly
   * is the recommended pattern; the provider resolves it once.
   */
  filecheck: FilecheckProp;
  children?: ReactNode;
}

export function FilecheckProvider({ filecheck, children }: FilecheckProviderProps) {
  const [instance, setInstance] = useState<FilecheckInstance | null>(() =>
    isPromise(filecheck) ? null : filecheck,
  );

  useEffect(() => {
    let cancelled = false;
    if (isPromise(filecheck)) {
      filecheck.then(
        (resolved) => {
          if (!cancelled) setInstance(resolved);
        },
        () => {
          // Load failures leave the context null; the caller handles/logs
          // the rejection on the promise it created.
          if (!cancelled) setInstance(null);
        },
      );
    } else {
      setInstance(filecheck);
    }
    return () => {
      cancelled = true;
    };
  }, [filecheck]);

  return <FilecheckContext.Provider value={instance}>{children}</FilecheckContext.Provider>;
}

/**
 * The resolved Filecheck factory instance, or `null` while the CDN script is
 * still loading (or during SSR). Must be used inside `<FilecheckProvider>`.
 */
export function useFilecheck(): FilecheckInstance | null {
  const value = useContext(FilecheckContext);
  if (value === undefined) {
    throw new Error('useFilecheck() must be used within a <FilecheckProvider>');
  }
  return value;
}
