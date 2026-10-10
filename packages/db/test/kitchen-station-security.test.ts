import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  createKitchenStationFixture,
  stationData,
  commandData,
  createStation,
  updateStation,
  retireStation,
} from './fixtures/kitchen-station.fixture';
test('PostgreSQL real: stații de bucătărie, claims exacte, izolare și arhivare', async (t) => {
  const f = await createKitchenStationFixture();
  try {
    const row = await f.txA((tx) => createStation(tx, stationData(f)));
    await t.test('RLS fără context/cross-tenant, privilegii și snapshot millisecond', async () => {
      assert.equal(await f.runtime.kitchenStation.count(), 0);
      assert.equal(await f.txB((tx) => tx.kitchenStation.count()), 0);
      assert.equal(await f.txB((tx) => tx.kitchenStationCommand.count()), 0);
      await assert.rejects(f.auth.kitchenStation.findMany(), /permission denied/);
      await assert.rejects(f.platform.kitchenStationCommand.findMany(), /permission denied/);
      const c = await f.txA((tx) =>
        tx.kitchenStationCommand.findFirstOrThrow({ where: { stationId: row.id } }),
      );
      assert.equal(c.resultCreatedAt!.getTime(), row.createdAt.getTime());
      assert.equal(c.resultUpdatedAt!.getTime(), row.updatedAt.getTime());
      await assert.rejects(
        f.txA((tx) => tx.kitchenStation.delete({ where: { id: row.id } })),
        /permission denied/,
      );
      await assert.rejects(
        f.txA((tx) => tx.kitchenStationCommand.delete({ where: { id: c.id } })),
        /permission denied/,
      );
      await assert.rejects(
        f.txA((tx) =>
          tx.kitchenStationCommand.update({ where: { id: c.id }, data: { status: 'RETIRED' } }),
        ),
        /permission denied/,
      );
      const [flags] = await f.runtime.$queryRaw<
        Array<{ forced: boolean; table_update: boolean; column_update: boolean }>
      >`
        SELECT relforcerowsecurity AS forced,has_table_privilege('pos_runtime','"KitchenStation"','UPDATE') AS table_update,
        has_column_privilege('pos_runtime','"KitchenStation"','name','UPDATE') AS column_update
        FROM pg_class WHERE oid='"KitchenStation"'::regclass`;
      assert.deepEqual(flags, { forced: true, table_update: false, column_update: true });
      // The retirement trigger really obtains FOR UPDATE with only column-level UPDATE privileges.
      await f.txA((tx) => retireStation(tx, f, randomUUID(), row.id));
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
          { sortOrder: -1 },
          { sortOrder: 100001 },
        ])
          await assert.rejects(
            f.txA((tx) => createStation(tx, stationData(f, bad))),
            /constraint|scoped actor|initial creation|unique/i,
          );
        await assert.rejects(
          f.runtime.kitchenStation.create({ data: stationData(f) }),
          /row-level|scoped actor/i,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.kitchenStation.update({ where: { id: row.id }, data: { code: 'HACK' } }),
          ),
          /permission denied/,
        );
      },
    );
    await t.test(
      'fără claim, ghost SUCCEEDED ulterior, snapshot fals și claim fără efect fac rollback',
      async () => {
        const data = stationData(f);
        await assert.rejects(
          f.txA((tx) => tx.kitchenStation.create({ data })),
          /constraint|terminal command/i,
        );
        assert.equal(
          await f.txA((tx) => tx.kitchenStation.count({ where: { code: data.code } })),
          0,
        );
        await assert.rejects(
          f.txA((tx) =>
            tx.kitchenStationCommand.create({
              data: { ...commandData(row), requestKey: randomUUID() },
            }),
          ),
          /constraint|exact effect|unique/i,
        );
        await assert.rejects(
          f.txA(async (tx) => {
            const r = await tx.kitchenStation.create({ data: stationData(f) });
            await tx.kitchenStationCommand.create({
              data: { ...commandData(r), resultName: 'Fals' },
            });
          }),
          /exact current terminal|exact effect/i,
        );
        await assert.rejects(
          f.txA(async (tx) => {
            const r = await tx.kitchenStation.update({
              where: { id: row.id },
              data: { version: 2, name: 'fals', lastRequestKey: randomUUID() },
            });
            await tx.kitchenStationCommand.create({
              data: { ...commandData(r, 'ARCHIVE', 1), resultStatus: 'ARCHIVED' },
            });
          }),
          /exact current terminal|exact effect/i,
        );
        assert.equal(
          (await f.txA((tx) => tx.kitchenStation.findUniqueOrThrow({ where: { id: row.id } })))
            .version,
          1,
        );
      },
    );
    await t.test('version, arhivare terminală, snapshoturi istorice și RETIRED', async () => {
      const renamed = await f.txA((tx) => updateStation(tx, row.id, f.a.user.id));
      assert.equal(renamed.version, 2);
      const original = await f.txA((tx) =>
        tx.kitchenStationCommand.findFirstOrThrow({
          where: { requestKey: row.creationRequestKey },
        }),
      );
      assert.equal(original.resultName, row.name);
      await assert.rejects(
        f.txA((tx) =>
          tx.kitchenStation.update({
            where: { id: row.id },
            data: { version: 4, lastRequestKey: randomUUID() },
          }),
        ),
        /fresh versioned/i,
      );
      const closed = await f.txA((tx) => updateStation(tx, row.id, f.a.user.id, 'ARCHIVE'));
      assert.equal(closed.status, 'ARCHIVED');
      await assert.rejects(
        f.txA((tx) => updateStation(tx, row.id, f.a.user.id)),
        /fresh versioned/i,
      );
      const key = randomUUID();
      await f.txA((tx) => retireStation(tx, f, key));
      await assert.rejects(
        f.txA((tx) =>
          createStation(tx, stationData(f, { creationRequestKey: key, lastRequestKey: key })),
        ),
        /unique|constraint/i,
      );
      assert.equal(
        await f.txA((tx) => tx.kitchenStation.count({ where: { creationRequestKey: key } })),
        0,
      );
    });
    await t.test('două mutații deferred incompatibile; perechi IMMEDIATE valide', async () => {
      const fresh = await f.txA((tx) => createStation(tx, stationData(f)));
      await assert.rejects(
        f.txA(async (tx) => {
          await updateStation(tx, fresh.id, f.a.user.id);
          await updateStation(tx, fresh.id, f.a.user.id);
        }),
        /exact current terminal|exact effect/i,
      );
      await f.txA(async (tx) => {
        await updateStation(tx, fresh.id, f.a.user.id);
        await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
        await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
        await updateStation(tx, fresh.id, f.a.user.id);
      });
      assert.equal(
        (await f.txA((tx) => tx.kitchenStation.findUniqueOrThrow({ where: { id: fresh.id } })))
          .version,
        3,
      );
    });
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
