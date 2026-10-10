import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { scanPrivateNames } from './reconcile-cursor';

it('avansează cursorul prin mai mult de 32 de fișiere fără a rescana primul lot', async () => {
  const organizationId = randomUUID();
  const directory = await mkdtemp(join(tmpdir(), 'pos-media-cursor-'));
  try {
    for (let index = 0; index < 41; index += 1)
      await writeFile(join(directory, `${randomUUID()}.webp`), Buffer.from('test'));
    const first = await scanPrivateNames(organizationId, directory);
    const second = await scanPrivateNames(organizationId, directory);
    expect(first).toHaveLength(32);
    expect(second).toHaveLength(9);
    expect(new Set([...first, ...second]).size).toBe(41);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('rezervă atomic maximum opt cursoare și nu deschide de două ori același director la evacuare', async () => {
  const entries = await Promise.all(
    Array.from({ length: 9 }, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'pos-media-cursor-cap-'));
      for (let index = 0; index < 33; index += 1)
        await writeFile(join(directory, `${randomUUID()}.webp`), Buffer.from('test'));
      return { organizationId: randomUUID(), directory };
    }),
  );
  try {
    const first = await Promise.all(
      entries.map(({ organizationId, directory }) => scanPrivateNames(organizationId, directory)),
    );
    expect(first.filter((names) => names.length === 32)).toHaveLength(8);
    const denied = entries[first.findIndex((names) => names.length === 0)]!;
    const [opened, duplicate] = await Promise.all([
      scanPrivateNames(denied.organizationId, denied.directory),
      scanPrivateNames(denied.organizationId, denied.directory),
    ]);
    expect(opened).toHaveLength(32);
    expect(duplicate).toEqual([]);
  } finally {
    for (const { organizationId, directory } of entries) {
      await scanPrivateNames(organizationId, directory);
      await scanPrivateNames(organizationId, directory);
      await rm(directory, { recursive: true, force: true });
    }
  }
});
