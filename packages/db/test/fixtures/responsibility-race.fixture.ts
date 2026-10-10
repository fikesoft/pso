import assert from 'node:assert/strict';
import { createDatabaseClient } from '../../src';
import type { ResponsibilityRaceOptions } from './responsibility-race.types';
export async function responsibilityRace(options: ResponsibilityRaceOptions) {
  const first = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    second = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    monitor = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1);
  let ready!: () => void, written!: () => void, release!: () => void;
  const snapshot = new Promise<void>((r) => {
      ready = r;
    }),
    writing = new Promise<void>((r) => {
      written = r;
    }),
    commit = new Promise<void>((r) => {
      release = r;
    });
  let winnerPid = 0,
    loserPid = 0;
  try {
    const loser = second.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.organization_id',${options.organizationId},true),set_config('app.user_id',${options.actor},true)`;
        const [pid] = await tx.$queryRaw<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
        loserPid = pid!.id;
        await options.snapshot(tx);
        ready();
        await writing;
        await options.loser(tx);
      },
      { isolationLevel: options.isolationLevel, timeout: 15000 },
    );
    const outcome = Promise.allSettled([loser]);
    await snapshot;
    const winner = first.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.organization_id',${options.organizationId},true),set_config('app.user_id',${options.actor},true)`;
        const [pid] = await tx.$queryRaw<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
        winnerPid = pid!.id;
        await options.winner(tx);
        written();
        await commit;
      },
      { timeout: 15000 },
    );
    const firstOutcome = Promise.allSettled([winner]);
    let blocked = false;
    try {
      await Promise.race([writing, winner]);
      for (let attempt = 0; attempt < 150; attempt++) {
        const [row] = await monitor.$queryRaw<
          { blocked: boolean }[]
        >`SELECT ${winnerPid}::int=ANY(pg_blocking_pids(${loserPid}::int)) AS blocked`;
        if (row!.blocked) {
          blocked = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
    } finally {
      release();
      written();
    }
    const [firstResult] = await firstOutcome,
      [secondResult] = await outcome;
    if (firstResult!.status === 'rejected') throw firstResult!.reason;
    assert.notEqual(winnerPid, loserPid);
    assert.ok(blocked, 'loser must actually wait for winner, not start after commit');
    return secondResult!;
  } finally {
    release?.();
    written?.();
    await Promise.all([first.$disconnect(), second.$disconnect(), monitor.$disconnect()]);
  }
}
