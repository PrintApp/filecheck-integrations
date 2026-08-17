import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from '../capabilities.js';
import { formatJobResult, toolErrorResult } from '../format.js';
import { resolveSource } from '../resolve-source.js';
import { submitAndWait } from '../run-job.js';
import { jobOutputShape, makeSourceSchema, waitSecondsSchema } from '../schemas.js';

const PROFILE_CODES = [
  'auto',
  '1a',
  '1b',
  '2a',
  '2b',
  '2u',
  '3a',
  '3b',
  '3u',
  '4',
  '4e',
  '4f',
  'ua1',
  'ua2',
] as const;

export function registerValidatePdf(server: McpServer, { client, caps }: ToolContext): void {
  server.registerTool(
    'validate_pdf',
    {
      title: 'Validate PDF/A / PDF/UA conformance',
      description:
        'Validate a PDF against PDF/A (archival) and PDF/UA (accessibility) conformance levels using veraPDF. ' +
        "Levels: 'auto' detects the claimed level; '1b'/'2b'/'3b' etc. are PDF/A flavors; 'ua1'/'ua2' are PDF/UA. " +
        'Read `compliant` per profile for the verdict; `status` only says whether validation ran.',
      inputSchema: {
        source: makeSourceSchema(caps),
        levels: z
          .array(z.enum(PROFILE_CODES))
          .optional()
          .describe(
            "Conformance levels to check (default 'auto' — detect from the file's own claim).",
          ),
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
            client.jobs.validate({
              sources: [
                {
                  ...source,
                  ...(args.levels?.length
                    ? { profile: args.levels.length === 1 ? args.levels[0] : [...args.levels] }
                    : {}),
                },
              ],
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
