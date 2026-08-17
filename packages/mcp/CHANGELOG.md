# filecheck-mcp

## 0.1.1

### Patch Changes

- f1eef72: list_catalog surfaces profile kinds: the text summary breaks entries down by kind (e.g. "11 profiles (7 pdf, 4 raster)") and the tool description tells agents to pick a profile whose kind matches the file's type.

## 0.1.0

### Minor Changes

- 1d0a846: Initial release: MCP server for the Filecheck API. Stdio CLI (`npx filecheck-mcp`) plus an embeddable `createFilecheckMcp` factory with capability-shaped tools — check_file, fix_file, validate_pdf, optimize_file, render_previews, get_job, list_jobs, delete_job, list_catalog, get_report, save_artifact.

### Patch Changes

- Updated dependencies [1d0a846]
  - filecheck-node@0.1.2
