import assert from 'node:assert/strict';
import type { PrismaClient } from '../../src';
import type { AddressRaceAction } from './address-race.types';
import type { createCustomerAddressFixture } from './customer-address.fixture';
export async function addressRace(
  f: Pick<Awaited<ReturnType<typeof createCustomerAddressFixture>>, 'a' | 'runtime'>,
  clients: PrismaClient[],
  isolationLevel: 'ReadCommitted' | 'RepeatableRead',
  actions: AddressRaceAction[],
) {
  let releaseSnapshots!: () => void, releaseWinner!: () => void, winnerWritten!: () => void;
  const snapshots = new Promise<void>((resolve) => {
    releaseSnapshots = resolve;
  });
  const written = new Promise<void>((resolve) => {
    winnerWritten = resolve;
  });
  const unblock = new Promise<void>((resolve) => {
    releaseWinner = resolve;
  });
  const pids: number[] = [];
  const outcomes = Promise.allSettled(
    clients.map((client, index) =>
      client.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true),set_config('app.user_id',${f.a.user.id},true)`;
          const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
          await tx.customerAddress.findMany({ select: { id: true, status: true } }); // Establish the RR snapshot before either action.
          pids[index] = row!.pid;
          if (pids[0] && pids[1]) releaseSnapshots();
          await snapshots;
          if (index === 1) await written;
          await actions[index]!(tx);
          if (index === 0) {
            winnerWritten();
            await unblock;
          }
        },
        { isolationLevel, timeout: 15000 },
      ),
    ),
  );
  let blocked = false;
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (pids[0] && pids[1]) {
        const [row] = await f.runtime.$queryRaw<
          Array<{ blocked: boolean }>
        >`SELECT ${pids[0]}::int=ANY(pg_blocking_pids(${pids[1]}::int)) AS blocked`;
        if (row?.blocked) {
          blocked = true;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    releaseSnapshots();
    winnerWritten();
    releaseWinner();
  }
  const results = await outcomes;
  assert.notEqual(pids[0], pids[1]);
  assert.ok(blocked, 'Two PostgreSQL sessions must contend on the row lock');
  assert.equal(results[0]!.status, 'fulfilled');
  return results;
}
