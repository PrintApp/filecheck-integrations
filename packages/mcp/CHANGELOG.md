# filecheck-mcp

## 0.3.6

### Patch Changes

- 358ebb6: When a job errors before any file is processed (every source failed: an unreachable or refused link, a missing upload), job results now say why. The verdict carries the API's reason, and `error`, `failedSources` and a `nextStep` are added (for a link: ask for a public link that downloads the file). filecheck-node declares `JobSummary.error` and `failedSources` (`FailedSource`).
- Updated dependencies [358ebb6]
  - filecheck-node@0.3.1

## 0.3.5

### Patch Changes

- d655430: `createFilecheckMcp` takes an optional `links` rewriter (`{ rewrite, ttlSeconds }`): every URL in a job result goes through it, and `expiresIn` and the deliverables note follow the rewritten links' lifetime. The hosted server uses it to replace presigned S3 URLs, which break when ChatGPT appends `?utm_source=chatgpt.com`, with links on its own domain. Without it, links are returned as before.

## 0.3.4

### Patch Changes

- d9f73f0: The hosted server no longer takes credentials as tool arguments: file sources have no `headers` (public links only), and `manage_destination` refuses passwords, private keys, passphrases and header values, telling the agent the merchant adds them in the Filecheck dashboard. The local CLI keeps both. New `credentialArgs` capability.

## 0.3.3

### Patch Changes

- 4a5c5a1: Product mapping is Shopify-only: `map_product`, `find_store_products`, `list_product_maps` and the server instructions now say that on WooCommerce, PrestaShop and OpenCart the merchant picks a product's workflow (and connector) in the Filecheck plugin's product settings, instead of telling agents to map those products by id.

## 0.3.2

### Patch Changes

- 4aef9db: `delete_job` declares `openWorldHint: false`: deleting a job never reaches a system outside Filecheck.

## 0.3.1

### Patch Changes

- d4e2de0: The server names itself with a title (`Filecheck`), its website and the Filecheck icon in its server info, so clients and directories show the current mark.

## 0.3.0

### Minor Changes

- 5be7606: Setup tools: `setup_reference` (the API's record schemas, read on demand), `manage_catalog` (create drafts, patch, publish, revert workflows, rules, profiles, connectors and optimize presets), `list_destinations` / `manage_destination` / `test_destination`, `list_product_maps` / `find_store_products` / `map_product`, `get_settings` / `update_settings`, and `list_webhooks` / `manage_webhook` / `test_webhook`. `check_file` takes `workflowId` to try a (draft) workflow on a real file; `list_catalog` lists drafts. Every tool now sets readOnlyHint, destructiveHint and openWorldHint explicitly, and API errors carry the field at fault and every validation problem.

### Patch Changes

- Updated dependencies [5be7606]
  - filecheck-node@0.3.0

## 0.2.0

### Minor Changes

- `jobs.list` / `list_jobs` accept an `orderId` filter: return every job linked to one shop order (the reconciliation path when a cart holds several upload items, each producing its own job). Jobs acquire their order linkage when the shop's order webhook fires, moments after checkout.

### Patch Changes

- Updated dependencies
  - filecheck-node@0.2.0

## 0.1.1

### Patch Changes

- f1eef72: list_catalog surfaces profile kinds: the text summary breaks entries down by kind (e.g. "11 profiles (7 pdf, 4 raster)") and the tool description tells agents to pick a profile whose kind matches the file's type.

## 0.1.0

### Minor Changes

- 1d0a846: Initial release: MCP server for the Filecheck API. Stdio CLI (`npx filecheck-mcp`) plus an embeddable `createFilecheckMcp` factory with capability-shaped tools — check_file, fix_file, validate_pdf, optimize_file, render_previews, get_job, list_jobs, delete_job, list_catalog, get_report, save_artifact.

### Patch Changes

- Updated dependencies [1d0a846]
  - filecheck-node@0.1.2
