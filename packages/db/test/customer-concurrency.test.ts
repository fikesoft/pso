import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { customerData } from './fixtures/customer.fixture';

test('PostgreSQL real: unicitatea clienților rezistă concurenței pe telefon/cheie cu snapshot RR anterior', async (t) => {
  const f = await createOperationsFixture();
  const clients = [
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
  ];
  try {
    let number = 0;
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const conflict of ['phoneLookupHash', 'creationRequestKey'] as const) {
        await t.test(
          `${isolationLevel}: conflict ${conflict}, o singură înregistrare`,
          async () => {
            const requestKey = randomUUID();
            const phoneHash = (++number).toString(16).padStart(64, '0');
            let releaseSnapshots!: () => void;
            let releaseWinner!: () => void;
            let winnerWritten!: () => void;
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
                    const [row] = await tx.$queryRaw<
                      Array<{ pid: number }>
                    >`SELECT pg_backend_pid() AS pid`;
                    // Both read an empty identity before the first insert; RR retains the old snapshot.
                    assert.equal(
                      await tx.customer.count({ where: { creationRequestKey: requestKey } }),
                      0,
                    );
                    pids[index] = row!.pid;
                    if (pids[0] && pids[1]) releaseSnapshots();
                    await snapshots;
                    if (index === 1) await written;
                    await tx.customer.create({
                      data: customerData(f, {
                        creationRequestKey:
                          conflict === 'creationRequestKey' || index === 0
                            ? requestKey
                            : randomUUID(),
                        phoneLookupHash:
                          conflict === 'phoneLookupHash' || index === 0
                            ? phoneHash
                            : 'f'.repeat(64),
                      }),
                    });
                    if (index === 0) {
                      winnerWritten();
                      await unblock;
                    }
                  },
                  { isolationLevel, timeout: 15000 },
                ),
              ),
            );
            let observedBlocked = false;
            try {
              for (let attempt = 0; attempt < 150; attempt++) {
                if (pids[1] && pids[0]) {
                  const [row] = await f.runtime.$queryRaw<Array<{ blocked: boolean }>>`
                  SELECT ${pids[0]}::int=ANY(pg_blocking_pids(${pids[1]}::int)) AS blocked`;
                  if (row?.blocked) {
                    observedBlocked = true;
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
            assert.ok(
              observedBlocked,
              'Operațiunile trebuie observate concurent pe cheia UNIQUE comună',
            );
            assert.equal(results[0]!.status, 'fulfilled');
            assert.equal(results[1]!.status, 'rejected');
            const loser = results[1]!;
            if (loser.status === 'rejected') {
              assert.ok(
                ['P2002', 'P2034'].includes(loser.reason?.code),
                `Este necesar un conflict de unicitate/serializare: ${String(loser.reason)}`,
              );
              assert.match(
                String(loser.reason),
                loser.reason.code === 'P2002'
                  ? new RegExp(conflict)
                  : /write conflict|serialization/i,
              );
            }
            const customers = await f.txA((tx) =>
              tx.customer.findMany({
                where: { OR: [{ creationRequestKey: requestKey }, { phoneLookupHash: phoneHash }] },
              }),
            );
            assert.equal(customers.length, 1);
            assert.equal(customers[0]!.creationRequestKey, requestKey);
            assert.equal(customers[0]!.phoneLookupHash, phoneHash);
          },
        );
      }
    }
  } finally {
    await Promise.all([
      ...clients.map((client) => client.$disconnect()),
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
    ]);
  }
});
