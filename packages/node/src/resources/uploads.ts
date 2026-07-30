import { APIError, InvalidRequestError } from '../errors.js';
import type { Requestor } from '../http/requestor.js';
import type { HttpTransport } from '../http/transport.js';

export type UploadInput = Blob | ArrayBuffer | ArrayBufferView | Buffer;

export interface UploadOptions {
  mimeType?: string;
  fileName?: string;
}

export interface UploadResult {
  fileRef: string;
  maxBytes: number;
  expiresIn: number;
}

interface PresignResponse {
  fileRef: string;
  upload: { url: string; fields: Record<string, string>; method: string };
  maxBytes: number;
  expiresIn: number;
}

function toBlob(input: UploadInput, mimeType?: string): Blob {
  if (typeof Blob !== 'undefined' && input instanceof Blob) return input;
  if (ArrayBuffer.isView(input)) {
    // Copy into a fresh ArrayBuffer so SharedArrayBuffer-backed views and
    // offset views are handled correctly.
    const bytes = new Uint8Array(
      input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength),
    );
    return new Blob([bytes], mimeType ? { type: mimeType } : undefined);
  }
  return new Blob([input], mimeType ? { type: mimeType } : undefined);
}

export class UploadsResource {
  constructor(
    private readonly requestor: Requestor,
    private readonly transport: HttpTransport,
    private readonly timeoutMs: number,
  ) {}

  /**
   * Upload a file for later use as a job source (`{ fileRef }`). Performs
   * both legs: `POST /uploads` for a presigned S3 POST, then the multipart
   * upload itself. Max 500 MB.
   */
  async create(file: UploadInput, options: UploadOptions = {}): Promise<UploadResult> {
    const blob = toBlob(file, options.mimeType);

    const { data: presign } = await this.requestor.json<PresignResponse>('POST', '/uploads', {
      body: {
        ...(options.mimeType !== undefined || blob.type
          ? { mimeType: options.mimeType ?? blob.type }
          : {}),
        sizeBytes: blob.size,
      },
      idempotent: false,
    });

    if (blob.size > presign.maxBytes) {
      throw new InvalidRequestError(
        `File is ${blob.size} bytes; the upload limit is ${presign.maxBytes} bytes`,
      );
    }

    // S3 presigned POST: policy fields first, the file part LAST.
    const form = new FormData();
    for (const [key, value] of Object.entries(presign.upload.fields)) {
      form.append(key, value);
    }
    form.append('file', blob, options.fileName ?? 'file');

    const response = await this.transport.request({
      method: 'POST',
      url: presign.upload.url,
      headers: {},
      body: form,
      timeoutMs: this.timeoutMs,
    });

    if (![200, 201, 204].includes(response.status)) {
      throw new APIError(`S3 upload leg failed with status ${response.status}`, {
        status: response.status,
        body: response.text,
      });
    }

    return {
      fileRef: presign.fileRef,
      maxBytes: presign.maxBytes,
      expiresIn: presign.expiresIn,
    };
  }
}
