---
"filecheck-mcp": patch
---

`createFilecheckMcp` takes an optional `links` rewriter (`{ rewrite, ttlSeconds }`): every URL in a job result goes through it, and `expiresIn` and the deliverables note follow the rewritten links' lifetime. The hosted server uses it to replace presigned S3 URLs, which break when ChatGPT appends `?utm_source=chatgpt.com`, with links on its own domain. Without it, links are returned as before.
