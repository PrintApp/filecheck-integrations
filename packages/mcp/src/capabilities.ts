import type { Filecheck } from 'filecheck-node';

/**
 * What the hosting process can do. Tools are SHAPED at registration time by
 * these flags (fields and whole tools appear or disappear) rather than
 * erroring at call time — agents should never see affordances they can't use.
 */
export interface Capabilities {
  /**
   * Whether this server process can read and write the local filesystem
   * (true for the stdio CLI, false for the remote Lambda). Gates the
   * `filePath` source field and the `save_artifact` tool.
   */
  localFiles: boolean;
  /**
   * Max total wait budget (ms) a submit tool may spend before returning a
   * `pending` result with polling guidance. Budgets ≥ 30 s also allow
   * holding the API's own ~27 s sync-submit wait.
   */
  maxWaitMs: number;
  /**
   * Whether tools may take credentials as arguments: auth headers for a
   * source URL, and delivery-destination passwords and private keys. True
   * for the local CLI (the user's own machine); false for the hosted server,
   * where chat apps (ChatGPT, Claude) would carry them through the
   * conversation. There, secrets go in through the Filecheck dashboard.
   */
  credentialArgs: boolean;
}

/** stdio CLI: local disk access, generous wait. */
export const LOCAL_CAPABILITIES: Capabilities = {
  localFiles: true,
  maxWaitMs: 180_000,
  credentialArgs: true,
};

/** Remote Lambda: no disk, budget safely inside the 29 s gateway ceiling. */
export const REMOTE_CAPABILITIES: Capabilities = {
  localFiles: false,
  maxWaitMs: 20_000,
  credentialArgs: false,
};

/**
 * Rewrites download links in tool results. The hosted server sets this so
 * presigned S3 URLs (which break when a chat app appends ?utm_source=…, since
 * S3 signs the whole query string) become links on the host's own domain that
 * redirect to a fresh presigned URL. Unset: links are returned as the API gave them.
 */
export interface LinkRewriter {
  /** A URL → the URL to hand out (return it unchanged when it isn't one to rewrite). */
  rewrite: (url: string) => string;
  /** How long a rewritten link stays valid, in seconds. */
  ttlSeconds: number;
}

/** Passed to every tool's register function. */
export interface ToolContext {
  client: Filecheck;
  caps: Capabilities;
  links?: LinkRewriter;
}
