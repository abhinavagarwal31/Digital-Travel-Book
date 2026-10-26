/** Fixed, server-chosen renditions; clients can never request arbitrary transformations. */
export const IMAGE_VARIANTS = {
  thumb: 400,
  page: 1600,
  cover: 2400,
} as const;
export type ImageVariant = keyof typeof IMAGE_VARIANTS;

/** What the browser needs to upload one file straight to storage. */
export interface SignedUpload {
  url: string;
  fields: Record<string, string>;
}

/**
 * Private image storage. Only the API holds credentials: the browser gets
 * one-off signed upload fields and never a delivery URL. Images reach the
 * browser solely through the API's ownership-checked image endpoint.
 */
export interface ImageStorage {
  signUpload(publicId: string): SignedUpload;
  /** Checks the signature storage returned to the browser after an upload. */
  verifyUploadSignature(publicId: string, version: number, signature: string): boolean;
  /** The original file bytes, refusing anything larger than maxBytes. */
  fetchOriginal(publicId: string, version: number, maxBytes: number): Promise<Buffer>;
  /** A resized rendition as a stream (metadata stripped by storage). */
  fetchVariant(publicId: string, version: number, variant: ImageVariant): Promise<Response>;
  /** Deletes one asset and its renditions; succeeds if it is already gone. */
  destroy(publicId: string): Promise<void>;
  /** Deletes every asset whose public id starts with the prefix. */
  destroyPrefix(prefix: string): Promise<void>;
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export class FileTooLargeError extends StorageError {
  constructor() {
    super('File is larger than allowed');
    this.name = 'FileTooLargeError';
  }
}

/** Reads a response body, aborting as soon as it exceeds maxBytes. */
export async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new FileTooLargeError();
  if (!res.body) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new FileTooLargeError();
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
