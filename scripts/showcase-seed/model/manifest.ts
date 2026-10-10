import { access, chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSeedRecord, parseSeedRecord } from './record';
import { assertTarget } from './target';
import type { SeedTarget } from './seed.types';

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
export async function seedManifest(target: SeedTarget, directory = '.local') {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `showcase-${target.mode}-accounts.json`);
  const pendingPath = `${path}.pending`;
  const finished = await exists(path);
  const pending = await exists(pendingPath);
  if (finished && pending)
    throw new Error('Două manifeste existente; recuperarea necesită verificare manuală.');
  const activePath = finished ? path : pendingPath;
  const record =
    finished || pending
      ? parseSeedRecord(JSON.parse(await readFile(activePath, 'utf8')))
      : createSeedRecord(target);
  assertTarget(record.target, target);
  if (!finished && !pending)
    await writeFile(pendingPath, `${JSON.stringify(record, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
  await chmod(activePath, 0o600);
  return {
    record,
    finished,
    path,
    complete: async () => {
      if (!finished) await rename(pendingPath, path);
    },
  };
}
