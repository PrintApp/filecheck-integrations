/** Injected from package.json at build time (tsup `env`); fallback covers src-mode runs (tests). */
export const VERSION = process.env.FILECHECK_MCP_VERSION ?? '0.0.0-dev';
