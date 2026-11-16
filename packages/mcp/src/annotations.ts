/**
 * Tool hints, set explicitly on every tool: OpenAI's directory scan flags a
 * tool that leaves any of readOnlyHint / destructiveHint / openWorldHint out,
 * and Claude's asks for destructiveHint on every tool that changes data so
 * clients confirm first. openWorldHint is true only for tools that reach a
 * system Filecheck doesn't control: a file's URL, the merchant's store
 * platform, or the shop's own hotfolder / webhook receiver.
 */
export const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const READ_WEB = { ...READ, openWorldHint: true } as const;

/** Changes the account's setup (records, mappings, settings). */
export const WRITE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export const WRITE_WEB = { ...WRITE, openWorldHint: true } as const;

/** Submits a file for processing: makes a new job, changes nothing that exists. */
export const PROCESS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;
