---
'filecheck-js': minor
'filecheck-react': minor
'filecheck-vue': minor
'filecheck': minor
---

Initial release.

- `filecheck-js`: typed idempotent loader for the CDN Element script plus the full
  shared Element type surface (intake + report elements, events, connector/facts, UI options).
- `filecheck-react`: `FilecheckProvider`, `useFilecheck()`, and a StrictMode-safe
  `<FilecheckIntake />` with latest-ref callbacks, `update()` vs recreate prop handling, and an
  imperative ref.
- `filecheck-vue`: `FilecheckPlugin`, `useFilecheck()`, and `<FilecheckIntake>` with Vue-style
  events, `v-model:jobId`, and Nuxt-safe SSR behavior.
- `filecheck`: server SDK — jobs (create/preflight/previews/fix/validate/optimize with
  `wait` normalization, retrieve, runs, list/iterate, delete, waitUntilTerminal), two-leg
  uploads, orders, read-only library resources, typed errors, GET-only retries, `jobs.verify()`
  fulfillment gate, and `webhooks.constructEvent` (parse-first; signing scheme pending upstream).
