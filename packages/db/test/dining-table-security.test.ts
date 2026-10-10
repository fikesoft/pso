import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  createDiningTableFixture,
  tableData,
  commandData,
  createTable,
  updateTable,
  retireTable,
} from './fixtures/dining-table.fixture';
test('PostgreSQL real: mese, claims exacte, izolare și arhivare', async (t) => {
  const f = await createDiningTableFixture();
  try {
    const row = await f.txA((tx) => createTable(tx, tableData(f)));
    await t.test('RLS fără context/cross-tenant, privilegii și snapshot millisecond', async () => {
      assert.equal(await f.runtime.diningTable.count(), 0);
      assert.equal(await f.txB((tx) => tx.diningTable.count()), 0);
      assert.equal(await f.txB((tx) => tx.diningTableCommand.count()), 0);
      await assert.rejects(f.auth.diningTable.findMany(), /permission denied/);
      await assert.rejects(f.platform.diningTableCommand.findMany(), /permission denied/);
      const c = await f.txA((tx) =>
        tx.diningTableCommand.findFirstOrThrow({ where: { tableId: row.id } }),
      );
      assert.equal(c.resultCreatedAt!.getTime(), row.createdAt.getTime());
      assert.equal(c.resultUpdatedAt!.getTime(), row.updatedAt.getTime());
      await assert.rejects(
        f.txA((tx) => tx.diningTable.delete({ where: { id: row.id } })),
        /permission denied/,
      );
      await assert.rejects(
        f.txA((tx) => tx.diningTableCommand.delete({ where: { id: c.id } })),
        /permission denied/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.diningTableCommand.update({ where: { id: c.id }, data: { status: 'RETIRED' } }),
        ),
        /permission denied/,
      );
      const [flags] = await f.runtime.$queryRaw<
        Array<{ forced: boolean; table_update: boolean; column_update: boolean }>
      >`
        SELECT relforcerowsecurity AS forced,has_table_privilege('pos_runtime','"DiningTable"','UPDATE') AS table_update,
        has_column_privilege('pos_runtime','"DiningTable"','name','UPDATE') AS column_update
        FROM pg_class WHERE oid='"DiningTable"'::regclass`;
      assert.deepEqual(flags, { forced: true, table_update: false, column_update: true });
      // The retirement trigger really obtains FOR UPDATE with only column-level UPDATE privileges.
      await f.txA((tx) => retireTable(tx, f, randomUUID(), row.id));
    });
    await t.test(
      'identități false, cod duplicat, actor/locație și context absent refuzate',
      async () => {
        for (const bad of [
          { locationId: f.locationB.id },
          { createdByUserId: f.b.user.id },
          { updatedByUserId: f.b.user.id },
          { organizationId: f.b.organization.id },
          { code: 'lower' },
          { name: ' ' },
          { code: row.code },
          { version: 2 },
          { capacity: 0 },
          { capacity: 1000 },
          { sortOrder: -1 },
          { sortOrder: 100001 },
        ])
          await assert.rejects(
            f.txA((tx) => createTable(tx, tableData(f, bad))),
            /constraint|scoped actor|initial creation|unique/i,
          );
        await assert.rejects(
          f.runtime.diningTable.create({ data: tableData(f) }),
          /row-level|scoped actor/i,
        );
        await assert.rejects(
          f.txA((tx) => tx.diningTable.update({ where: { id: row.id }, data: { code: 'HACK' } })),
          /permission denied/,
        );
      },
    );
    await t.test(
      'fără claim, ghost SUCCEEDED ulterior, snapshot fals și claim fără efect fac rollback',
      async () => {
        const data = tableData(f);
        await assert.rejects(
          f.txA((tx) => tx.diningTable.create({ data })),
          /constraint|terminal command/i,
        );
        assert.equal(await f.txA((tx) => tx.diningTable.count({ where: { code: data.code } })), 0);
        await assert.rejects(
          f.txA((tx) =>
            tx.diningTableCommand.create({
              data: { ...commandData(row), requestKey: randomUUID() },
            }),
          ),
          /constraint|exact effect|unique/i,
        );
        await assert.rejects(
          f.txA(async (tx) => {
            const r = await tx.diningTable.create({ data: tableData(f) });
            await tx.diningTableCommand.create({
              data: { ...commandData(r), resultName: 'Fals' },
            });
          }),
          /exact current terminal|exact effect/i,
        );
        await assert.rejects(
          f.txA(async (tx) => {
            const r = await tx.diningTable.update({
              where: { id: row.id },
              data: { version: 2, name: 'fals', lastRequestKey: randomUUID() },
            });
            await tx.diningTableCommand.create({
              data: { ...commandData(r, 'ARCHIVE', 1), resultStatus: 'ARCHIVED' },
            });
          }),
          /exact current terminal|exact effect/i,
        );
        assert.equal(
          (await f.txA((tx) => tx.diningTable.findUniqueOrThrow({ where: { id: row.id } })))
            .version,
          1,
        );
      },
    );
    await t.test('version, arhivare terminală, snapshoturi istorice și RETIRED', async () => {
      const renamed = await f.txA((tx) => updateTable(tx, row.id, f.a.user.id));
      assert.equal(renamed.version, 2);
      const original = await f.txA((tx) =>
        tx.diningTableCommand.findFirstOrThrow({ where: { requestKey: row.creationRequestKey } }),
      );
      assert.equal(original.resultName, row.name);
      await assert.rejects(
        f.txA((tx) =>
          tx.diningTable.update({
            where: { id: row.id },
            data: { version: 4, lastRequestKey: randomUUID() },
          }),
        ),
        /fresh versioned/i,
      );
      const closed = await f.txA((tx) => updateTable(tx, row.id, f.a.user.id, 'ARCHIVE'));
      assert.equal(closed.status, 'ARCHIVED');
      await assert.rejects(
        f.txA((tx) => updateTable(tx, row.id, f.a.user.id)),
        /fresh versioned/i,
      );
      const key = randomUUID();
      await f.txA((tx) => retireTable(tx, f, key));
      await assert.rejects(
        f.txA((tx) =>
          createTable(tx, tableData(f, { creationRequestKey: key, lastRequestKey: key })),
        ),
        /unique|constraint/i,
      );
      assert.equal(
        await f.txA((tx) => tx.diningTable.count({ where: { creationRequestKey: key } })),
        0,
      );
    });
    await t.test('două mutații deferred incompatibile; perechi IMMEDIATE valide', async () => {
      const fresh = await f.txA((tx) => createTable(tx, tableData(f)));
      await assert.rejects(
        f.txA(async (tx) => {
          await updateTable(tx, fresh.id, f.a.user.id);
          await updateTable(tx, fresh.id, f.a.user.id);
        }),
        /exact current terminal|exact effect/i,
      );
      await f.txA(async (tx) => {
        await updateTable(tx, fresh.id, f.a.user.id);
        await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
        await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
        await updateTable(tx, fresh.id, f.a.user.id);
      });
      assert.equal(
        (await f.txA((tx) => tx.diningTable.findUniqueOrThrow({ where: { id: fresh.id } })))
          .version,
        3,
      );
    });
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
