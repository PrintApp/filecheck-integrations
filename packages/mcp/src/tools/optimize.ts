import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from '../capabilities.js';
import { formatJobResult, toolErrorResult } from '../format.js';
import { resolveSource } from '../resolve-source.js';
import { submitAndWait } from '../run-job.js';
import { jobOutputShape, makeSourceSchema, waitSecondsSchema } from '../schemas.js';

export function registerOptimizeFile(server: McpServer, { client, caps }: ToolContext): void {
  server.registerTool(
    'optimize_file',
    {
      title: 'Optimize a file',
      description:
        'Optimize a PDF or image: downsample and recompress images, strip dead weight, flatten. ' +
        "Options are namespaced under `params.pdf` and/or `params.raster` (see the schema at https://filecheck.io/docs/schemas/jobs-optimize-post.json). An optimize preset from list_catalog type 'optimize-presets' contains a ready-made params object you can pass through. " +
        'The optimized file arrives as a deliverable with a download URL (~60 min TTL).',
      inputSchema: {
        source: makeSourceSchema(caps),
        params: z
          .record(z.unknown())
          .optional()
          .describe('Namespaced optimize options: `{ pdf: {…}, raster: {…} }`. Omit for defaults.'),
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
            client.jobs.optimize({ sources: [{ ...source, params: args.params ?? {} }], ...wait }),
          args.waitSeconds,
        );
        return formatJobResult(run);
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );
}
