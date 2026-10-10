import { config } from '../../../shared/config';
import * as local from './local-files';
import * as blob from './blob-files';
export { storageKey } from './storage-key';

export async function storePrivateImage(organizationId: string, assetId: string, bytes: Buffer) {
  return config.MEDIA_STORAGE === 'vercel-blob'
    ? blob.storeBlobImage(organizationId, assetId, bytes)
    : local.storePrivateImage(organizationId, assetId, bytes);
}

export async function readPrivateImage(
  organizationId: string,
  assetId: string,
  checksum: string,
  expectedSize: number,
) {
  return config.MEDIA_STORAGE === 'vercel-blob'
    ? blob.readBlobImage(organizationId, assetId, checksum, expectedSize)
    : local.readPrivateImage(organizationId, assetId, checksum, expectedSize);
}
