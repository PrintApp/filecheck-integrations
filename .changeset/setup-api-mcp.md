---
"filecheck-mcp": minor
---

Setup tools: `setup_reference` (the API's record schemas, read on demand), `manage_catalog` (create drafts, patch, publish, revert workflows, rules, profiles, connectors and optimize presets), `list_destinations` / `manage_destination` / `test_destination`, `list_product_maps` / `find_store_products` / `map_product`, `get_settings` / `update_settings`, and `list_webhooks` / `manage_webhook` / `test_webhook`. `check_file` takes `workflowId` to try a (draft) workflow on a real file; `list_catalog` lists drafts. Every tool now sets readOnlyHint, destructiveHint and openWorldHint explicitly, and API errors carry the field at fault and every validation problem.
