import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { get, put } from '@vercel/blob';
import { readBlobImage, storeBlobImage } from './blob-files';

vi.mock('@vercel/blob', () => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('../../../shared/config', () => ({ config: { BLOB_READ_WRITE_TOKEN: 'synthetic' } }));
function identity() {
  return {
    org: '11111111-1111-4111-8111-111111111111',
    asset: '22222222-2222-4222-8222-222222222222',
  };
}
function result(
  bytes: Uint8Array,
  size = bytes.length,
  pathname = `${identity().org}/${identity().asset}.webp`,
) {
  return {
    statusCode: 200,
    blob: { size, pathname },
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  };
}
afterEach(() => vi.clearAllMocks());
it('încarcă numai chei UUID tenant în Blob privat, fără suprascriere sau URL-uri în DTO', async () => {
  const { org, asset } = identity();
  vi.mocked(put).mockResolvedValue({} as Awaited<ReturnType<typeof put>>);
  expect(await storeBlobImage(org, asset, Buffer.from('synthetic'))).toBe(`${org}/${asset}.webp`);
  expect(put).toHaveBeenCalledWith(
    `${org}/${asset}.webp`,
    expect.any(Buffer),
    expect.objectContaining({
      access: 'private',
      allowOverwrite: false,
      addRandomSuffix: false,
      token: 'synthetic',
    }),
  );
  await expect(storeBlobImage('../foreign', asset, Buffer.from('x'))).rejects.toThrow();
  expect(put).toHaveBeenCalledTimes(1);
});
it('citește fără cache și verifică SHA-256, dimensiunea și cheia tenantului', async () => {
  const { org, asset } = identity();
  const bytes = Buffer.from('synthetic');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  vi.mocked(get).mockResolvedValue(result(bytes) as Awaited<ReturnType<typeof get>>);
  expect(await readBlobImage(org, asset, checksum, bytes.length)).toEqual(bytes);
  expect(get).toHaveBeenCalledWith(
    `${org}/${asset}.webp`,
    expect.objectContaining({ access: 'private', useCache: false }),
  );
  vi.mocked(get).mockResolvedValue(result(bytes) as Awaited<ReturnType<typeof get>>);
  await expect(readBlobImage(org, asset, 'invalid-checksum', bytes.length)).rejects.toThrow();
  vi.mocked(get).mockResolvedValue(
    result(bytes, bytes.length, `foreign/${asset}.webp`) as Awaited<ReturnType<typeof get>>,
  );
  await expect(readBlobImage(org, asset, checksum, bytes.length)).rejects.toThrow();
});
it('nu bufferizează peste dimensiunea salvată, chiar dacă metadatele mint', async () => {
  const { org, asset } = identity();
  vi.mocked(get).mockResolvedValue(
    result(new Uint8Array(100), 1) as Awaited<ReturnType<typeof get>>,
  );
  await expect(readBlobImage(org, asset, 'checksum', 1)).rejects.toThrow();
  vi.mocked(get).mockResolvedValue(null);
  await expect(readBlobImage(org, asset, 'checksum', 1)).rejects.toThrow();
});
