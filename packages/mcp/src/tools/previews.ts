import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from '../capabilities.js';
import { formatJobResult, toolErrorResult } from '../format.js';
import { resolveSource } from '../resolve-source.js';
import { submitAndWait } from '../run-job.js';
import { jobOutputShape, makeSourceSchema, waitSecondsSchema } from '../schemas.js';

export function registerRenderPreviews(server: McpServer, { client, caps }: ToolContext): void {
  server.registerTool(
    'render_previews',
    {
      title: 'Render page previews',
      description:
        "Render raster preview images of a file's pages — useful to actually look at a file. " +
        'Preview URLs ride in the `previews` output (capped at 20 pages per file) and expire like all download URLs (~60 min).',
      inputSchema: {
        source: makeSourceSchema(caps),
        params: z
          .record(z.unknown())
          .optional()
          .describe(
            'Optional rendering options passed through to the previews engine (size, page range, format).',
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
            client.jobs.previews({
              sources: [{ ...source, ...(args.params ? { params: args.params } : {}) }],
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
