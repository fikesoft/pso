import { createHash } from 'node:crypto';
import { idSchema } from '@pos/contracts';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../../../shared/lib/http';
import { MEDIA_OUTPUT_BYTES } from '../config/media.constants';
import { storageKey } from './storage-key';

const root = fileURLToPath(new URL('../../../../../../.local/files/', import.meta.url));

async function privateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Calea locală de fișiere nu este un director privat.');
  await chmod(path, 0o700);
}

async function syncDirectory(path: string) {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export function privateOrgDirectory(organizationId: string) {
  return join(root, idSchema.parse(organizationId));
}

export async function storePrivateImage(organizationId: string, assetId: string, bytes: Buffer) {
  const parent = dirname(root);
  await privateDirectory(parent);
  await syncDirectory(dirname(parent));
  await privateDirectory(root);
  await syncDirectory(parent);
  const directory = privateOrgDirectory(organizationId);
  await privateDirectory(directory);
  await syncDirectory(root);
  const path = join(directory, `${assetId}.webp`);
  const handle = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(directory);
  return storageKey(organizationId, assetId);
}

export async function readPrivateImage(
  organizationId: string,
  assetId: string,
  checksum: string,
  expectedSize: number,
) {
  const path = join(privateOrgDirectory(organizationId), `${idSchema.parse(assetId)}.webp`);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      expectedSize < 1 ||
      expectedSize > MEDIA_OUTPUT_BYTES ||
      stat.size !== expectedSize
    )
      throw new HttpError(500, 'Fișierul imagine are dimensiune invalidă.');
    const bytes = await handle.readFile();
    if (bytes.length !== expectedSize)
      throw new HttpError(500, 'Fișierul imagine s-a modificat în timpul citirii.');
    if (createHash('sha256').update(bytes).digest('hex') !== checksum)
      throw new HttpError(500, 'Fișierul imagine nu poate fi verificat.');
    return bytes;
  } finally {
    await handle.close();
  }
}
