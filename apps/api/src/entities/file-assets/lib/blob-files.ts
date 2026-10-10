import { createHash } from 'node:crypto';
import { get, put } from '@vercel/blob';
import { config } from '../../../shared/config';
import { HttpError } from '../../../shared/lib/http';
import { MEDIA_OUTPUT_BYTES, MEDIA_BLOB_TIMEOUT_MS } from '../config/media.constants';
import { storageKey } from './storage-key';

export function blobOptions() {
  if (!config.BLOB_READ_WRITE_TOKEN) throw new Error('Store-ul Blob privat nu este configurat.');
  return {
    token: config.BLOB_READ_WRITE_TOKEN,
    abortSignal: AbortSignal.timeout(MEDIA_BLOB_TIMEOUT_MS),
  };
}

export async function storeBlobImage(organizationId: string, assetId: string, bytes: Buffer) {
  const key = storageKey(organizationId, assetId);
  if (!bytes.length || bytes.length > MEDIA_OUTPUT_BYTES)
    throw new HttpError(413, 'Imaginea normalizată depășește limita.');
  await put(key, bytes, {
    ...blobOptions(),
    access: 'private',
    contentType: 'image/webp',
    addRandomSuffix: false,
    allowOverwrite: false,
  });
  return key;
}

export async function readBlobImage(
  organizationId: string,
  assetId: string,
  checksum: string,
  expectedSize: number,
) {
  const key = storageKey(organizationId, assetId);
  if (!Number.isInteger(expectedSize) || expectedSize < 1 || expectedSize > MEDIA_OUTPUT_BYTES)
    throw new HttpError(500, 'Dimensiunea imaginii nu este validă.');
  const result = await get(key, { ...blobOptions(), access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream)
    throw new HttpError(404, 'Imaginea nu este disponibilă.');
  if (result.blob.size !== expectedSize || result.blob.pathname !== key) {
    await result.stream.cancel();
    throw new HttpError(500, 'Metadatele imaginii nu pot fi verificate.');
  }
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > expectedSize) {
        await reader.cancel();
        throw new HttpError(500, 'Imaginea depășește dimensiunea salvată.');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  if (
    bytes.length !== expectedSize ||
    createHash('sha256').update(bytes).digest('hex') !== checksum
  )
    throw new HttpError(500, 'Integritatea imaginii nu poate fi verificată.');
  return bytes;
}
