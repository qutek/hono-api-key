---
'hono-api-key': patch
---

Fix build output file extensions to match package.json exports

- Update tsup config to generate .mjs for ESM and .cjs for CommonJS
- Ensures package.json exports point to correct files
- Fixes "module not found" error when installing the package
