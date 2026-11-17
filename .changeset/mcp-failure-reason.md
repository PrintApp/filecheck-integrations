---
"filecheck-mcp": patch
"filecheck-node": patch
---

When a job errors before any file is processed (every source failed: an unreachable or refused link, a missing upload), job results now say why. The verdict carries the API's reason, and `error`, `failedSources` and a `nextStep` are added (for a link: ask for a public link that downloads the file). filecheck-node declares `JobSummary.error` and `failedSources` (`FailedSource`).
