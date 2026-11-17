---
"filecheck-mcp": patch
---

The hosted server no longer takes credentials as tool arguments: file sources have no `headers` (public links only), and `manage_destination` refuses passwords, private keys, passphrases and header values, telling the agent the merchant adds them in the Filecheck dashboard. The local CLI keeps both. New `credentialArgs` capability.
