import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDatabaseClient } from '../src';
import {
  createCashRegisterFixture,
  registerData,
  commandData,
  createRegister,
  retireRegister,
} from './fixtures/cash-register.fixture';
test('PostgreSQL real: mutex casă, versiuni și identități concurente RC/RR', async (t) => {
  const f = await createCashRegisterFixture();
  const clients = [
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
    createDatabaseClient(process.env.TEST_DATABASE_URL!, 1),
  ];
  try {
    for (const isolationLevel of ['ReadCommitted', 'RepeatableRead'] as const)
      for (const scenario of [
        'CREATE_KEY',
        'CREATE_CODE',
        'RENAME_RENAME',
        'RENAME_ARCHIVE',
        'ARCHIVE_ARCHIVE',
        'RENAME_RETIRE',
        'RETIRE_RENAME',
      ] as const)
        await t.test(`${isolationLevel}: ${scenario}`, async () => {
          const initial = await f.txA((tx) => createRegister(tx, registerData(f)));
          const key = randomUUID(),
            code = `R-${randomUUID().slice(0, 8).toUpperCase()}`;
          let releaseSnapshots!: () => void, winnerWritten!: () => void, releaseWinner!: () => void;
          const snapshots = new Promise<void>((r) => {
            releaseSnapshots = r;
          });
          const written = new Promise<void>((r) => {
            winnerWritten = r;
          });
          const unblock = new Promise<void>((r) => {
            releaseWinner = r;
          });
          const pids: number[] = [];
          const resultsPromise = Promise.allSettled(
            clients.map((client, index) =>
              client.$transaction(
                async (tx) => {
                  await tx.$executeRaw`SELECT set_config('app.organization_id',${f.a.organization.id},true),set_config('app.user_id',${f.a.user.id},true)`;
                  const [pid] = await tx.$queryRaw<
                    Array<{ id: number }>
                  >`SELECT pg_backend_pid() AS id`;
                  assert.equal(
                    await tx.cashRegisterCommand.count({ where: { requestKey: key } }),
                    0,
                  );
                  pids[index] = pid!.id;
                  if (pids[0] && pids[1]) releaseSnapshots();
                  await snapshots;
                  if (index === 1) await written;
                  const retire =
                    (scenario === 'RENAME_RETIRE' && index === 1) ||
                    (scenario === 'RETIRE_RENAME' && index === 0);
                  if (scenario.startsWith('CREATE')) {
                    const request = scenario === 'CREATE_KEY' || index === 0 ? key : randomUUID();
                    await createRegister(
                      tx,
                      registerData(f, {
                        code,
                        creationRequestKey: request,
                        lastRequestKey: request,
                      }),
                    );
                  } else if (retire) await retireRegister(tx, f, key, initial.id);
                  else {
                    await tx.$queryRaw`SELECT id FROM "CashRegister" WHERE id=${initial.id}::uuid FOR UPDATE`;
                    const archive =
                      scenario === 'ARCHIVE_ARCHIVE' ||
                      (scenario === 'RENAME_ARCHIVE' && index === 1);
                    const r = await tx.cashRegister.update({
                      where: { id: initial.id },
                      data: {
                        ...(archive ? { status: 'ARCHIVED' } : { name: 'Nume concurent' }),
                        version: initial.version + 1,
                        lastRequestKey: scenario.includes('RETIRE') ? key : randomUUID(),
                        lastRequestHash: 'b'.repeat(64),
                        updatedByUserId: f.a.user.id,
                      },
                    });
                    await tx.cashRegisterCommand.create({
                      data: commandData(r, archive ? 'ARCHIVE' : 'RENAME', initial.version),
                    });
                  }
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
            for (let n = 0; n < 150; n++) {
              if (pids[0] && pids[1]) {
                const [row] = await f.runtime.$queryRaw<Array<{ blocked: boolean }>>`
                  SELECT ${pids[0]}::int=ANY(pg_blocking_pids(${pids[1]}::int)) AS blocked`;
                if (row?.blocked) {
                  blocked = true;
                  break;
                }
              }
              await new Promise((r) => setTimeout(r, 20));
            }
          } finally {
            releaseSnapshots();
            winnerWritten();
            releaseWinner();
          }
          const results = await resultsPromise;
          assert.ok(blocked, 'Două conexiuni reale trebuie observate în competiție pe lock/UNIQUE');
          assert.equal(results[0]!.status, 'fulfilled');
          assert.equal(results[1]!.status, 'rejected');
          if (results[1]!.status === 'rejected') {
            const error = results[1].reason;
            assert.ok(
              ['P2002', 'P2034'].includes(error?.code) ||
                (/Code: `40001`/.test(String(error)) &&
                  /could not serialize access/.test(String(error))) ||
                /fresh versioned|cannot retire an applied register key/i.test(String(error)),
              String(error),
            );
          }
          if (scenario.startsWith('CREATE'))
            assert.equal(await f.txA((tx) => tx.cashRegister.count({ where: { code } })), 1);
          else {
            const current = await f.txA((tx) =>
              tx.cashRegister.findUniqueOrThrow({ where: { id: initial.id } }),
            );
            assert.equal(current.version, scenario === 'RETIRE_RENAME' ? 1 : 2);
            assert.equal(
              await f.txA((tx) =>
                tx.cashRegisterCommand.count({
                  where: { registerId: initial.id, status: 'SUCCEEDED' },
                }),
              ),
              scenario === 'RETIRE_RENAME' ? 1 : 2,
            );
          }
        });
  } finally {
    await Promise.all([
      ...clients.map((c) => c.$disconnect()),
      f.runtime.$disconnect(),
      f.auth.$disconnect(),
      f.platform.$disconnect(),
    ]);
  }
});
