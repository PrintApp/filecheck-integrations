---
"filecheck-mcp": patch
---

Fix jobs now report the re-check of the fixed file. `fix_file` and `get_job` used to list the first check's findings (of the upload) next to the job's final outcome, so problems the fix had solved still showed as rejects. Files that were re-checked now show that re-check's findings and summary with `checkedFile: "fixed"`, and `initialCheck` summarises what the upload had. Findings from a fix with no re-check are marked `checkedFile: "original"`. `get_report` reads the same check by default; `check: "initial"` reads the upload's.
