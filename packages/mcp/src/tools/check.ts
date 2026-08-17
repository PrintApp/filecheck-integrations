import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from '../capabilities.js';
import { formatJobResult, toolErrorResult } from '../format.js';
import { resolveSource } from '../resolve-source.js';
import { submitAndWait } from '../run-job.js';
import { contextSchema, jobOutputShape, makeSourceSchema, waitSecondsSchema } from '../schemas.js';

export function registerCheckFile(server: McpServer, { client, caps }: ToolContext): void {
  server.registerTool(
    'check_file',
    {
      title: 'Check (preflight) a print file',
      description:
        'Check a file for print-readiness against a preflight profile. Returns a verdict with findings and a recommended autofix. ' +
        'READ THE TWO AXES: `status` is execution (done/error), `outcome` is the verdict — status:done + outcome:fail means the check completed and the file is NOT print-ready; do not treat done as success. ' +
        'Pass `context` whenever the ordered product dimensions are known. Omitting `profileId` runs every supported check but returns raw findings with no pass/fail verdict. ' +
        'If the result is pending, poll get_job — never resubmit.',
      inputSchema: {
        source: makeSourceSchema(caps),
        profileId: z
          .string()
          .optional()
          .describe(
            "Preflight profile id (discover via list_catalog type 'profiles'). Omit to run all checks with no verdict.",
          ),
        ruleId: z
          .string()
          .optional()
          .describe(
            "Intake rule id (list_catalog type 'rules'). When set, the rule's flow decides steps and profile per file type; profileId is then a fallback hint only.",
          ),
        context: contextSchema.optional(),
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
            args.ruleId
              ? client.jobs.create({
                  // POST /jobs requires steps per source; the rule overrides them.
                  sources: [
                    {
                      ...source,
                      steps: [
                        {
                          type: 'preflight',
                          ...(args.profileId ? { params: { profileId: args.profileId } } : {}),
                        },
                      ],
                    },
                  ],
                  ruleId: args.ruleId,
                  ...(args.context ? { context: args.context } : {}),
                  ...wait,
                })
              : client.jobs.preflight({
                  sources: [
                    { ...source, ...(args.profileId ? { profileId: args.profileId } : {}) },
                  ],
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
