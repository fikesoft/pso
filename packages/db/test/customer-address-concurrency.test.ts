import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import {
  createCustomerAddressFixture,
  addressData,
  retireAddress,
} from './fixtures/customer-address.fixture';

test('PostgreSQL real: salvare adresă versus retragerea cheii, inclusiv snapshot RepeatableRead anterior', async (t) => {
  const f = await createCustomerAddressFixture();
  const clients = [
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
  ];
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const) {
      for (const winner of ['CREATED', 'RETIRED'] as const) {
        await t.test(
          `${isolationLevel}: ${winner} câștigă; cealaltă operațiune este anulată`,
          async () => {
            const requestKey = randomUUID();
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
                    // Both transactions see no claim before the winner writes. RR keeps this snapshot.
                    assert.equal(
                      await tx.customerAddressCreationClaim.count({ where: { requestKey } }),
                      0,
                    );
                    pids[index] = row!.pid;
                    if (pids[0] && pids[1]) releaseSnapshots();
                    await snapshots;
                    if (index === 1) await written;
                    const create = (index === 0) === (winner === 'CREATED');
                    if (create)
                      await tx.customerAddress.create({
                        data: addressData(f, { creationRequestKey: requestKey }),
                      });
                    else await retireAddress(tx, f, requestKey);
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
                  ? /requestKey|customer_address_claim_identity/
                  : /write conflict|serialization/i,
              );
            }
            const claims = await f.txA((tx) =>
              tx.customerAddressCreationClaim.findMany({ where: { requestKey } }),
            );
            assert.equal(claims.length, 1);
            assert.equal(claims[0]!.status, winner);
            assert.equal(
              await f.txA((tx) =>
                tx.customerAddress.count({ where: { creationRequestKey: requestKey } }),
              ),
              winner === 'CREATED' ? 1 : 0,
            );
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
