import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { loadScheduleAvailability } from '../../../apps/api/src/entities/menu-schedule';
import { runMenuScheduleRaces } from './menu-schedule-concurrency.cases';

test('PostgreSQL real: programul meniului păstrează tenantul, locația, versiunea și produsele', async (t) => {
  const state = await createOperationsFixture();
  try {
    await runMenuScheduleRaces(t, state);
    const data = {
      organizationId: state.a.organization.id,
      locationId: state.locationA.id,
      name: 'Program sintetic',
      eventName: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startMinute: 0,
      endMinute: 1440,
      requestKey: randomUUID(),
      requestHash: 'a'.repeat(64),
      createdByUserId: state.a.user.id,
    };
    const schedule = await state.txA(async (tx) => {
      const value = await tx.menuSchedule.create({ data });
      await tx.menuScheduleProduct.create({
        data: {
          organizationId: data.organizationId,
          locationId: data.locationId,
          menuScheduleId: value.id,
          productId: state.catalogA.product.id,
        },
      });
      return tx.menuSchedule.findUniqueOrThrow({ where: { id: value.id } });
    });
    await t.test('fără context sau din alt tenant nu se vede programul', async () => {
      assert.equal(await state.runtime.menuSchedule.count(), 0);
      assert.equal(await state.runtime.menuScheduleProduct.count(), 0);
      assert.equal(await state.txB((tx) => tx.menuSchedule.count()), 0);
      assert.equal(await state.txB((tx) => tx.menuScheduleProduct.count()), 0);
      await assert.rejects(
        state.txA((tx) =>
          tx.menuSchedule.create({
            data: {
              ...data,
              organizationId: state.b.organization.id,
              requestKey: randomUUID(),
            },
          }),
        ),
      );
    });
    await t.test('produsele nu pot veni din altă locație sau organizație', async () => {
      for (const change of [
        { locationId: state.locationB.id, productId: state.catalogA.product.id },
        { locationId: state.locationA.id, productId: state.catalogB.product.id },
      ])
        await assert.rejects(
          state.txA((tx) =>
            tx.menuScheduleProduct.create({
              data: {
                organizationId: data.organizationId,
                menuScheduleId: schedule.id,
                ...change,
              },
            }),
          ),
        );
      assert.equal(
        (await state.txA((tx) => tx.menuSchedule.findUniqueOrThrow({ where: { id: schedule.id } })))
          .version,
        schedule.version,
      );
    });
    await t.test('identitatea, actorul și cheia de creare nu pot fi rescrise', async () => {
      for (const change of [
        { requestKey: randomUUID(), version: { increment: 1 } },
        { createdByUserId: state.b.user.id, version: { increment: 1 } },
        { name: 'Fără versiune' },
      ])
        await assert.rejects(
          state.txA((tx) => tx.menuSchedule.update({ where: { id: schedule.id }, data: change })),
        );
      await assert.rejects(
        state.txA((tx) => tx.menuSchedule.delete({ where: { id: schedule.id } })),
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.menuSchedule.create({
            data: {
              ...data,
              requestKey: randomUUID(),
              createdByUserId: state.b.user.id,
            },
          }),
        ),
      );
    });
    await t.test(
      'regulile invalide și un program fără produse sunt refuzate la commit',
      async () => {
        await assert.rejects(
          state.txA(
            (tx) =>
              tx.$executeRaw`UPDATE "MenuSchedule" SET weekdays=ARRAY[[1,2]],version=version+1 WHERE id=${schedule.id}::uuid`,
          ),
        );
        for (const change of [
          { weekdays: [1, 1] },
          { weekdays: [] },
          { weekdays: [7] },
          { startMinute: 50, endMinute: 50 },
          { endMinute: 1441 },
          { eventName: 'Eveniment fără date' },
          { startsOn: new Date('2026-10-01'), endsOn: new Date('2026-09-01') },
        ])
          await assert.rejects(
            state.txA((tx) =>
              tx.menuSchedule.update({
                where: { id: schedule.id },
                data: { ...change, version: { increment: 1 } },
              }),
            ),
          );
        await assert.rejects(
          state.txA((tx) =>
            tx.menuSchedule.create({ data: { ...data, requestKey: randomUUID() } }),
          ),
        );
        await assert.rejects(
          state.txA((tx) =>
            tx.menuScheduleProduct.deleteMany({ where: { menuScheduleId: schedule.id } }),
          ),
        );
      },
    );
    await t.test(
      'ora bazei și fusul locației controlează regula; arhivarea elimină restricția',
      async () => {
        const read = () =>
          state.txA((tx) =>
            loadScheduleAvailability(tx, data.locationId, [state.catalogA.product.id]),
          );
        const initially = (await read()).get(state.catalogA.product.id)!;
        assert.equal(initially.available, true);
        assert.equal(initially.scheduled, true);
        assert.ok(Number.isFinite(Date.parse(initially.checkedAt)));
        await state.txA((tx) =>
          tx.menuSchedule.update({
            where: { id: schedule.id },
            data: {
              startsOn: new Date('1970-01-01'),
              endsOn: new Date('1970-01-01'),
              version: { increment: 1 },
            },
          }),
        );
        assert.equal((await read()).get(state.catalogA.product.id)!.available, false);
        await state.txA((tx) =>
          tx.menuSchedule.update({
            where: { id: schedule.id },
            data: {
              status: 'ARCHIVED',
              version: { increment: 1 },
            },
          }),
        );
        assert.equal((await read()).get(state.catalogA.product.id)!.available, true);
        assert.equal((await read()).get(state.catalogA.product.id)!.scheduled, false);
      },
    );
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
