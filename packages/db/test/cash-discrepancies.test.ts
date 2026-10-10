import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTenantTransaction } from '../src';
import { createCashRegisterFixture, updateRegister } from './fixtures/cash-register.fixture';
import {
  openCashShiftFixture,
  openRegisterShiftFixture,
  closeCashShiftFixture,
} from './fixtures/cash-shift.fixture';
import { discrepancyPage } from '../../../apps/api/src/features/cash-discrepancies/model/discrepancy-page';
import { discrepancyRegisters } from '../../../apps/api/src/features/cash-discrepancies/model/discrepancy-registers';
import type { DiscrepancyContext } from '../../../apps/api/src/features/cash-discrepancies/model/discrepancy.types';

test('PostgreSQL real: raport immutable, snapshoturi, cursor și opțiuni complete', async (t) => {
  const f = await createCashRegisterFixture();
  try {
    const first = await openCashShiftFixture(f, 'a', f.locationA.id, '10');
    await f.txA((tx) => closeCashShiftFixture(tx, first.id, '9'));
    await f.txA((tx) => updateRegister(tx, first.registerId, f.a.user.id));
    const renamed = await f.txA((tx) =>
      openRegisterShiftFixture(tx, first.registerId, f.a.user.id, '3'),
    );
    await f.txA((tx) => closeCashShiftFixture(tx, renamed.id, '3'));
    await f.txA((tx) => updateRegister(tx, first.registerId, f.a.user.id, 'ARCHIVE'));
    const second = await openCashShiftFixture(f, 'a', f.locationA.id, '10');
    await f.txA((tx) => closeCashShiftFixture(tx, second.id, '11'));
    const instant = new Date(),
      day = instant.toISOString().slice(0, 10);
    const context: DiscrepancyContext = {
      organizationId: f.a.organization.id,
      actor: f.a.user.id,
      locationId: f.locationA.id,
      closedFrom: day,
      closedTo: day,
      timezone: 'UTC',
      discrepancy: 'ALL',
      limit: 1,
    };
    const readonly = <T>(fn: Parameters<typeof withTenantTransaction<T>>[2]) =>
      withTenantTransaction(
        f.runtime,
        { organizationId: f.a.organization.id, userId: f.a.user.id },
        fn,
        { readOnlySnapshot: true },
      );
    await t.test(
      'paginarea raportului păstrează toate denumirile istorice, inclusiv arhivate',
      async () => {
        const ids = new Set<string>();
        let cursor: string | undefined;
        do {
          const page = await readonly((tx) =>
            discrepancyPage(tx, { ...context, ...(cursor ? { cursor } : {}) }),
          );
          for (const row of page.closings) {
            assert.ok(!ids.has(row.closing.id));
            ids.add(row.closing.id);
            if (row.shift.id === first.id) assert.equal(row.shift.registerName, first.registerName);
            if (row.shift.id === renamed.id)
              assert.equal(row.shift.registerName, renamed.registerName);
          }
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        assert.equal(ids.size, 3);
        assert.equal(
          (
            await readonly((tx) =>
              discrepancyPage(tx, { ...context, discrepancy: 'NONZERO', limit: 100 }),
            )
          ).closings.length,
          2,
        );
      },
    );
    await t.test(
      'opțiunile independente și cursorul provin din întregul set, nu din pagina raportului',
      async () => {
        const page = await readonly((tx) => discrepancyRegisters(tx, context));
        assert.equal(page.registers.length, 1);
        assert.ok(page.nextCursor);
        const more = await readonly((tx) =>
          discrepancyRegisters(tx, { ...context, cursor: page.nextCursor! }),
        );
        assert.equal(more.registers.length, 1);
        assert.equal(more.nextCursor, null);
        const option = [...page.registers, ...more.registers].find(
          (r) => r.registerId === first.registerId,
        )!;
        assert.equal(option.registerName, renamed.registerName);
        const nonzero = await readonly((tx) =>
          discrepancyRegisters(tx, { ...context, discrepancy: 'NONZERO', limit: 100 }),
        );
        assert.equal(
          nonzero.registers.find((r) => r.registerId === first.registerId)!.registerName,
          first.registerName,
        );
        for (const change of [
          { timezone: 'Europe/Chisinau' },
          { actor: f.b.user.id },
          { discrepancy: 'NONZERO' as const },
          { limit: 2 },
        ])
          await assert.rejects(
            readonly((tx) =>
              discrepancyRegisters(tx, { ...context, ...change, cursor: page.nextCursor! }),
            ),
            /Cursorul/,
          );
        assert.equal((await f.txB((tx) => discrepancyPage(tx, context))).closings.length, 0);
      },
    );
    await t.test('raportul execută doar citiri și nu mută closingurile', async () => {
      const before = await f.txA((tx) => tx.cashClosing.findMany({ orderBy: { id: 'asc' } }));
      await readonly(async (tx) => {
        const [row] = await tx.$queryRaw<
          Array<{ readOnly: string }>
        >`SELECT current_setting('transaction_read_only') AS "readOnly"`;
        assert.equal(row!.readOnly, 'on');
        await discrepancyPage(tx, { ...context, limit: 100 });
      });
      assert.deepEqual(
        await f.txA((tx) => tx.cashClosing.findMany({ orderBy: { id: 'asc' } })),
        before,
      );
    });
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
