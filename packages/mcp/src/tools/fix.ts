import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from '../capabilities.js';
import { formatJobResult, toolErrorResult } from '../format.js';
import { resolveSource } from '../resolve-source.js';
import { submitAndWait } from '../run-job.js';
import { contextSchema, jobOutputShape, makeSourceSchema, waitSecondsSchema } from '../schemas.js';

export function registerFixFile(server: McpServer, { client, caps }: ToolContext): void {
  server.registerTool(
    'fix_file',
    {
      title: 'Fix a print file automatically',
      description:
        'Preflight a file, apply every safe automatic fix, and (by default) re-check the fixed output. The fixed file is returned as a deliverable — use IT, not the original. ' +
        'outcome:fixed means issues were repaired; outcome:fail after a repreflight means problems remain that autofix cannot solve. ' +
        '`status` is execution, `outcome` is the verdict — read both. If pending, poll get_job; never resubmit.',
      inputSchema: {
        source: makeSourceSchema(caps),
        profileId: z
          .string()
          .optional()
          .describe(
            "Preflight profile that decides what counts as a problem (list_catalog type 'profiles').",
          ),
        context: contextSchema.optional(),
        repreflight: z
          .boolean()
          .optional()
          .describe('Re-run preflight on the fixed output to confirm the repair (default true).'),
        waitSeconds: waitSecondsSchema,
      },
      outputSchema: jobOutputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const source = await resolveSource(client, caps, args.source);
        const run = await submitAndWait(
          client,
          caps,
          (wait) =>
            client.jobs.fix({
              sources: [{ ...source, ...(args.profileId ? { profileId: args.profileId } : {}) }],
              repreflight: args.repreflight ?? true,
              ...(args.context ? { context: args.context } : {}),
              ...wait,
            }),
          args.waitSeconds,
        );
        return formatJobResult(run);
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );
}
