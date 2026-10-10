import type { Dir } from 'node:fs';

export type ReconcileCursor = {
  dir: Dir | null;
  busy: boolean;
  lastUsed: number;
  timer?: ReturnType<typeof setTimeout>;
};
