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
}

/** stdio CLI: local disk access, generous wait. */
export const LOCAL_CAPABILITIES: Capabilities = { localFiles: true, maxWaitMs: 180_000 };

/** Remote Lambda: no disk, budget safely inside the 29 s gateway ceiling. */
export const REMOTE_CAPABILITIES: Capabilities = { localFiles: false, maxWaitMs: 20_000 };

/** Passed to every tool's register function. */
export interface ToolContext {
  client: Filecheck;
  caps: Capabilities;
}
