---
"filecheck-mcp": patch
"filecheck-node": patch
---

`context.sheet.across` (`"short"` or `"long"`): the customer's answer to which side of an image gang sheet runs across the film. The API already accepted it to settle a sheet it reports as `ambiguous`, but the MCP tools' context schema dropped it. `check_file` and `fix_file` now pass it on, and filecheck-node's `JobContext` declares it.
