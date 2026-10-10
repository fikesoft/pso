import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
import { readImage, uploadImage } from './api/media-http';
import type { OperationsFixture } from './api/operations.types';

const objects = vi.hoisted(() => {
  process.env.MEDIA_STORAGE = 'vercel-blob';
  process.env.BLOB_READ_WRITE_TOKEN = 'synthetic-private-token';
  return new Map<string, Buffer>();
});
vi.mock('../apps/api/node_modules/@vercel/blob/dist/index.js', () => ({
  put: async (key: string, bytes: Buffer, options: Record<string, unknown>) => {
    expect(options.access).toBe('private');
    expect(options.allowOverwrite).toBe(false);
    if (objects.has(key)) throw new Error('Object already exists');
    objects.set(key, Buffer.from(bytes));
  },
  get: async (key: string, options: Record<string, unknown>) => {
    expect(options.access).toBe('private');
    const bytes = objects.get(key);
    return bytes
      ? {
          statusCode: 200,
          blob: { size: bytes.length, pathname: key },
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          }),
        }
      : null;
  },
  list: async () => ({ blobs: [], hasMore: false }),
  head: vi.fn(),
  del: vi.fn(),
}));
let fixture: OperationsFixture;
beforeAll(async () => {
  fixture = await prepareOperations();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

it('HTTP/PostgreSQL: fotografii private Blob cu izolare, replay și retragerea accesului la eliminare', async () => {
  const { a, b, worker } = fixture;
  const user = (await a.primary.expect('/staff')).users.find(
    (entry: { login: string }) => entry.login === 'chelner',
  );
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFElEQVQImWM448JwxoUBhM+4MAAAIP4EQeprLZYAAAAASUVORK5CYII=',
    'base64',
  );
  const path = `/staff/${user.id}/avatar?version=${user.version}&requestKey=${randomUUID()}`;
  const saved = await uploadImage(worker, path, png);
  expect(saved.status).toBe(200);
  expect((await uploadImage(worker, path, png)).data).toEqual(saved.data);
  expect(objects.size).toBe(1);
  const profile = (await worker.expect(`/staff/${user.id}/profile`)).profile;
  expect(profile.user.avatarUrl).toMatch(/^\/api\/tenant\//);
  expect(JSON.stringify(profile)).not.toContain('synthetic-private-token');
  const image = await readImage(worker, profile.user.avatarUrl);
  expect(image.status).toBe(200);
  expect(image.bytes.toString('ascii', 8, 12)).toBe('WEBP');
  expect((await readImage(b.primary, profile.user.avatarUrl)).status).toBe(404);
  await worker.expect(`/staff/${user.id}/avatar/clear`, 'POST', {
    version: saved.data.version,
    requestKey: randomUUID(),
  });
  expect((await readImage(worker, profile.user.avatarUrl)).status).toBe(404);
  expect(objects.size).toBe(1); // Immutable history remains private, outside the current resource URL.
});
