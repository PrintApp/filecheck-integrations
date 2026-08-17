import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Filecheck, SourceRef } from 'filecheck-node';
import type { Capabilities } from './capabilities.js';
import type { SourceInput } from './schemas.js';

/** Reading a multi-hundred-MB file into memory on the user's machine is rude. */
const MAX_LOCAL_BYTES = 200 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.eps': 'application/postscript',
  '.ai': 'application/postscript',
  '.zip': 'application/zip',
};

/**
 * Turn a tool `source` argument into an API `SourceRef`. A `filePath` is
 * uploaded out-of-band (presigned S3 POST) so file bytes never transit the
 * model context; `url`/`fileRef` pass through.
 */
export async function resolveSource(
  client: Filecheck,
  caps: Capabilities,
  source: SourceInput,
): Promise<SourceRef & { name?: string }> {
  const locators = [
    caps.localFiles && source.filePath ? 'filePath' : null,
    source.url ? 'url' : null,
    source.fileRef ? 'fileRef' : null,
  ].filter(Boolean);

  if (locators.length !== 1) {
    const allowed = caps.localFiles ? 'filePath, url, or fileRef' : 'url or fileRef';
    throw new Error(
      locators.length === 0
        ? `source needs exactly one of ${allowed} — none was provided.`
        : `source needs exactly one of ${allowed} — got ${locators.join(' + ')}.`,
    );
  }

  if (source.filePath && caps.localFiles) {
    const info = await stat(source.filePath).catch(() => null);
    if (!info?.isFile()) {
      throw new Error(`filePath not found or not a file: ${source.filePath}`);
    }
    if (info.size > MAX_LOCAL_BYTES) {
      throw new Error(
        `File is ${Math.round(info.size / 1024 / 1024)} MB; filePath uploads are capped at ${MAX_LOCAL_BYTES / 1024 / 1024} MB. Host the file and pass a url source instead.`,
      );
    }
    const fileName = source.name ?? basename(source.filePath);
    const upload = await client.uploads.create(await readFile(source.filePath), {
      fileName,
      mimeType: MIME_BY_EXT[extname(source.filePath).toLowerCase()],
    });
    return { fileRef: upload.fileRef, name: fileName };
  }

  if (source.url) {
    return {
      url: source.url,
      ...(source.headers ? { headers: source.headers } : {}),
      ...(source.name ? { name: source.name } : {}),
    };
  }
  return { fileRef: source.fileRef, ...(source.name ? { name: source.name } : {}) };
}
