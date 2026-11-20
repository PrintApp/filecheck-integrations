# filecheck-node

## 0.3.2

### Patch Changes

- 6be69a4: `context.sheet.across` (`"short"` or `"long"`): the customer's answer to which side of an image gang sheet runs across the film. The API already accepted it to settle a sheet it reports as `ambiguous`, but the MCP tools' context schema dropped it. `check_file` and `fix_file` now pass it on, and filecheck-node's `JobContext` declares it.

## 0.3.1

### Patch Changes

- 358ebb6: When a job errors before any file is processed (every source failed: an unreachable or refused link, a missing upload), job results now say why. The verdict carries the API's reason, and `error`, `failedSources` and a `nextStep` are added (for a link: ask for a public link that downloads the file). filecheck-node declares `JobSummary.error` and `failedSources` (`FailedSource`).

## 0.3.0

### Minor Changes

- 5be7606: Setup API resources: `workflows`, `rules`, `profiles`, `connectors` and `optimizePresets` gain `create` (drafts, dry runs), `update` (JSON Merge Patch), `del`, `publish` and `revert`; new `destinations` (with `test`), `productMaps`, `products.search`, `settings` and `webhookEndpoints` (with `events` and `test`). `jobs.create` takes `workflowId` and `previewWorkflow`. The client also accepts an OAuth access token (`fat_…`) in place of a secret key.

## 0.2.0

### Minor Changes

- `jobs.list` / `list_jobs` accept an `orderId` filter: return every job linked to one shop order (the reconciliation path when a cart holds several upload items, each producing its own job). Jobs acquire their order linkage when the shop's order webhook fires, moments after checkout.

## 0.1.2

### Patch Changes

- 1d0a846: Type `context` (JobContext — artworkSize, pageCount, fileCount, bleed, safety) on CreateJobParams, PreflightParams, and FixParams. The API already accepted it; the types now do too.

## 0.1.1

### Patch Changes

- 46fbd7b: Correct the repository URL in the published package metadata
  (github.com/PrintApp/filecheck-integrations). First release through the
  token-free OIDC trusted-publishing pipeline.

## 0.1.0

### Minor Changes

- 0f29001: Initial release.

  - `filecheck-js`: typed idempotent loader for the CDN Element script plus the full
    shared Element type surface (intake + report elements, events, connector/facts, UI options).
  - `filecheck-react`: `FilecheckProvider`, `useFilecheck()`, and a StrictMode-safe
    `<FilecheckIntake />` with latest-ref callbacks, `update()` vs recreate prop handling, and an
    imperative ref.
  - `filecheck-vue`: `FilecheckPlugin`, `useFilecheck()`, and `<FilecheckIntake>` with Vue-style
    events, `v-model:jobId`, and Nuxt-safe SSR behavior.
  - `filecheck-node`: server SDK — jobs (create/preflight/previews/fix/validate/optimize with
    `wait` normalization, retrieve, runs, list/iterate, delete, waitUntilTerminal), two-leg
    uploads, orders, read-only library resources, typed errors, GET-only retries, `jobs.verify()`
    fulfillment gate, and `webhooks.constructEvent` (parse-first; signing scheme pending upstream).
