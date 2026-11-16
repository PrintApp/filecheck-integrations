---
"filecheck-node": minor
---

Setup API resources: `workflows`, `rules`, `profiles`, `connectors` and `optimizePresets` gain `create` (drafts, dry runs), `update` (JSON Merge Patch), `del`, `publish` and `revert`; new `destinations` (with `test`), `productMaps`, `products.search`, `settings` and `webhookEndpoints` (with `events` and `test`). `jobs.create` takes `workflowId` and `previewWorkflow`. The client also accepts an OAuth access token (`fat_…`) in place of a secret key.
