import { opendir } from 'node:fs/promises';
import {
  MEDIA_RECONCILE_BATCH,
  MEDIA_RECONCILE_CURSOR_IDLE_MS,
  MEDIA_RECONCILE_CURSOR_LIMIT,
} from '../config/media.constants';
import type { ReconcileCursor } from '../model/reconcile-cursor.types';

/** Advances a bounded directory cursor across calls; idle handles close automatically. */
export const scanPrivateNames = (() => {
  const cursors = new Map<string, ReconcileCursor>();
  return async (organizationId: string, directory: string): Promise<string[]> => {
    let cursor = cursors.get(organizationId);
    if (cursor?.busy) return [];
    if (!cursor) {
      let evicted: ReconcileCursor | undefined;
      if (cursors.size >= MEDIA_RECONCILE_CURSOR_LIMIT) {
        const oldest = [...cursors]
          .filter(([, value]) => !value.busy)
          .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
        if (!oldest) return [];
        cursors.delete(oldest[0]);
        if (oldest[1].timer) clearTimeout(oldest[1].timer);
        evicted = oldest[1];
      }
      cursor = { dir: null, busy: true, lastUsed: Date.now() };
      cursors.set(organizationId, cursor);
      try {
        await evicted?.dir?.close();
        cursor.dir = await opendir(directory);
      } catch (error) {
        if (cursors.get(organizationId) === cursor) cursors.delete(organizationId);
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      }
    } else {
      cursor.busy = true;
      if (cursor.timer) clearTimeout(cursor.timer);
    }
    try {
      const names: string[] = [];
      for (let index = 0; index < MEDIA_RECONCILE_BATCH; index += 1) {
        const entry = await cursor.dir!.read();
        if (!entry) {
          await cursor.dir!.close();
          if (cursors.get(organizationId) === cursor) cursors.delete(organizationId);
          return names;
        }
        names.push(entry.name);
      }
      return names;
    } catch (error) {
      await cursor.dir?.close().catch(() => undefined);
      if (cursors.get(organizationId) === cursor) cursors.delete(organizationId);
      throw error;
    } finally {
      cursor.busy = false;
      cursor.lastUsed = Date.now();
      if (cursors.get(organizationId) === cursor) {
        cursor.timer = setTimeout(() => {
          if (cursors.get(organizationId) !== cursor || cursor.busy) return;
          cursors.delete(organizationId);
          void cursor.dir?.close().catch(() => undefined);
        }, MEDIA_RECONCILE_CURSOR_IDLE_MS);
        cursor.timer.unref();
      }
    }
  };
})();
