# filecheck-mcp

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
