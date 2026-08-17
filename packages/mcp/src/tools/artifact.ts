import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Artifact } from 'filecheck-node';
import { z } from 'zod';
import type { ToolContext } from '../capabilities.js';
import { jsonResult, toolErrorResult } from '../format.js';

function describeDeliverables(deliverables: Artifact[]): string {
  return deliverables
    .map(
      (d, i) =>
        `[${i}] ${d.fileName ?? d.kind ?? d.role ?? 'unnamed'} (${d.mimeType ?? 'unknown type'})`,
    )
    .join(', ');
}

function pickDeliverable(
  deliverables: Artifact[],
  selector: number | string | undefined,
): Artifact | null {
  if (selector === undefined) return deliverables.length === 1 ? (deliverables[0] ?? null) : null;
  if (typeof selector === 'number') return deliverables[selector] ?? null;
  return (
    deliverables.find((d) => d.fileName === selector) ??
    deliverables.find((d) => d.kind === selector || d.role === selector) ??
    null
  );
}

/** Registered only when `caps.localFiles` — the remote server has no disk. */
export function registerSaveArtifact(server: McpServer, { client }: ToolContext): void {
  server.registerTool(
    'save_artifact',
    {
      title: 'Save a deliverable to disk',
      description:
        "Download one of a job's deliverables (fixed file, optimized file, report, …) to a local path. " +
        'Re-fetches the job first so the download URL is fresh — pass the jobId, not a URL.',
      inputSchema: {
        jobId: z.string().describe('The job_… id whose deliverable to save.'),
        deliverable: z
          .union([z.number().int().min(0), z.string()])
          .optional()
          .describe(
            'Index, fileName, kind, or role of the deliverable. Optional when the job has exactly one.',
          ),
        outPath: z
          .string()
          .describe(
            'Where to save: a file path, or an existing directory (the deliverable fileName is appended).',
          ),
      },
      outputSchema: {
        savedTo: z.string(),
        bytes: z.number(),
        mimeType: z.string().nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const job = await client.jobs.retrieve(args.jobId);
        if (job.deliverables.length === 0) {
          return toolErrorResult(
            new Error(
              `Job ${args.jobId} has no deliverables (status: ${job.status}, outcome: ${job.outcome ?? 'n/a'}).`,
            ),
          );
        }
        const chosen = pickDeliverable(job.deliverables, args.deliverable);
        if (!chosen) {
          return toolErrorResult(
            new Error(
              `Could not pick a deliverable${args.deliverable !== undefined ? ` matching '${args.deliverable}'` : ' — the job has several'}. Available: ${describeDeliverables(job.deliverables)}. Pass one as 'deliverable'.`,
            ),
          );
        }
        if (!chosen.downloadUrl) {
          return toolErrorResult(
            new Error('The selected deliverable has no download URL on a fresh read.'),
          );
        }

        const response = await fetch(chosen.downloadUrl);
        if (!response.ok) {
          return toolErrorResult(new Error(`Download failed with status ${response.status}.`));
        }
        const bytes = Buffer.from(await response.arrayBuffer());

        let target = args.outPath;
        const existing = await stat(target).catch(() => null);
        if (existing?.isDirectory()) {
          target = join(target, chosen.fileName ?? `${args.jobId}-deliverable`);
        } else {
          await mkdir(dirname(target), { recursive: true });
        }
        await writeFile(target, bytes);

        return jsonResult(
          { savedTo: target, bytes: bytes.length, mimeType: chosen.mimeType ?? null },
          `Saved ${chosen.fileName ?? 'deliverable'} (${bytes.length} bytes) to ${target}.`,
        );
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );
}
