import { loadFilecheck } from '@filecheck/element-js';
import type { FilecheckInstance, LoadFilecheckOptions } from '@filecheck/element-js';
import { inject, readonly, shallowRef } from 'vue';
import type { App, InjectionKey, Plugin, Ref, ShallowRef } from 'vue';

export const FilecheckInjectionKey: InjectionKey<Readonly<ShallowRef<FilecheckInstance | null>>> =
  Symbol('filecheck');

export interface FilecheckPluginOptions extends LoadFilecheckOptions {
  /** Tenant publishable key (`pk_…`). Required unless `filecheck` is given. */
  publishableKey?: string;
  /**
   * Bring your own instance/promise (e.g. from a Nuxt plugin that called
   * `loadFilecheck` itself). When set, `publishableKey` is ignored.
   */
  filecheck?: Promise<FilecheckInstance | null> | FilecheckInstance | null;
}

/**
 * `app.use(FilecheckPlugin, { publishableKey: 'pk_…' })`
 *
 * Loads the CDN script (client-side only — SSR-safe for Nuxt) and provides a
 * `ShallowRef<FilecheckInstance | null>` to `useFilecheck()` and
 * `<FilecheckIntake>`.
 */
export const FilecheckPlugin: Plugin<[FilecheckPluginOptions]> = {
  install(app: App, options: FilecheckPluginOptions) {
    const instance = shallowRef<FilecheckInstance | null>(null);

    const supplied = options?.filecheck;
    if (supplied !== undefined) {
      if (supplied && typeof (supplied as { then?: unknown }).then === 'function') {
        void (supplied as Promise<FilecheckInstance | null>).then((resolved) => {
          instance.value = resolved;
        });
      } else {
        instance.value = (supplied as FilecheckInstance | null) ?? null;
      }
    } else if (typeof window !== 'undefined') {
      // loadFilecheck resolves null during SSR anyway; the window guard just
      // avoids kicking off work on the server at all.
      const { publishableKey, ...loadOptions } = options ?? {};
      if (!publishableKey) {
        throw new Error('[filecheck] FilecheckPlugin requires a publishableKey');
      }
      void loadFilecheck(publishableKey, loadOptions).then((resolved) => {
        instance.value = resolved;
      });
    }

    app.provide(FilecheckInjectionKey, readonly(instance) as Ref<FilecheckInstance | null>);
  },
};

/**
 * The resolved Filecheck factory as a (shallow) ref — `null` while the CDN
 * script is loading or during SSR. Must be used inside an app that installed
 * `FilecheckPlugin`.
 */
export function useFilecheck(): Readonly<ShallowRef<FilecheckInstance | null>> {
  const provided = inject(FilecheckInjectionKey, undefined);
  if (!provided) {
    throw new Error('[filecheck] useFilecheck() requires app.use(FilecheckPlugin, …)');
  }
  return provided;
}
