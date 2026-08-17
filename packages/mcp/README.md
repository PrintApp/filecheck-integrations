# filecheck-mcp

[Model Context Protocol](https://modelcontextprotocol.io) server for the
[Filecheck](https://filecheck.io) API — check, fix, validate, optimize, and
preview print files from Claude, Cursor, or any MCP client.

## Quick start

```bash
claude mcp add filecheck -e FILECHECK_API_KEY=sk_... -- npx -y filecheck-mcp
```

Claude Desktop / Cursor config:

```json
{
  "mcpServers": {
    "filecheck": {
      "command": "npx",
      "args": ["-y", "filecheck-mcp"],
      "env": { "FILECHECK_API_KEY": "sk_..." }
    }
  }
}
```

`FILECHECK_API_KEY` is your secret key (`sk_…`) from the Filecheck dashboard.
Optional: `FILECHECK_BASE_URL` to point at a different API host.

Prefer a hosted endpoint? The same tools (minus local-file access) are served
at `https://api.filecheck.io/mcp` with an `Authorization: Bearer sk_…` header.

## Tools

| Tool | What it does |
| --- | --- |
| `check_file` | Preflight a file (path, URL, or fileRef) against a profile — verdict, findings, recommended autofix |
| `fix_file` | Preflight + apply safe automatic fixes + re-check; returns the fixed file |
| `validate_pdf` | PDF/A / PDF/UA conformance (veraPDF) |
| `optimize_file` | Downsample, recompress, slim |
| `render_previews` | Rasterize pages so the agent can look at the file |
| `get_job` | Poll a job / re-mint fresh signed download URLs |
| `list_jobs` | Recent jobs, lean envelopes |
| `delete_job` | Soft-delete a job |
| `list_catalog` | Browse profiles, rules, workflows, connectors, optimize presets |
| `get_report` | Drill into the full preflight report, paginated per section |
| `save_artifact` | Save a deliverable to a local path (stdio server only) |

Results always carry two independent axes: `status` (did it run) and
`outcome` (the verdict) — `status: done` + `outcome: fail` means the check
completed and the file is **not** print-ready.

## Embedding

The server is also exported as a factory for embedding in your own transport:

```ts
import { createFilecheckMcp, LOCAL_CAPABILITIES } from 'filecheck-mcp';
import { Filecheck } from 'filecheck-node';

const server = createFilecheckMcp({
  client: new Filecheck(process.env.FILECHECK_API_KEY),
  capabilities: LOCAL_CAPABILITIES, // or REMOTE_CAPABILITIES
});
```

Docs: https://filecheck.io/docs/integrations/mcp
