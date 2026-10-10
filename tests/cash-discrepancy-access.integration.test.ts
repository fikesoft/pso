import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareCashDiscrepancies } from './api/cash-discrepancies-setup';
import { closeOperations } from './api/operations-setup';
import type { CashDiscrepanciesFixture } from './api/cash-discrepancies.types';
import type { CashDiscrepancyResponse } from '../packages/contracts/src/cash-discrepancies';

let f: CashDiscrepanciesFixture;
beforeAll(async () => {
  f = await prepareCashDiscrepancies();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('diferențe scope: fiecare pagină cere toate cele3 drepturi în locația explicită', async () => {
  for (const endpoint of ['discrepancies', 'discrepancy-registers']) {
    const path = `/cash-shifts/${endpoint}?${f.query()}`;
    expect((await f.movementActors.owner!.session.call(path)).status).toBe(403);
    expect((await f.b.primary.call(path)).status).toBe(403);
    expect(
      (
        await f.movementActors.reporter!.session.call(
          `/cash-shifts/${endpoint}?${f.query({ locationId: f.otherLocation.id })}`,
        )
      ).status,
    ).toBe(403);
  }
});

it('diferențe cursor: pagini complete, domeniu/actor/filtre/limit legate și timezone invalidat', async () => {
  const actor = f.movementActors.reporter!.session;
  const first: CashDiscrepancyResponse = await f.report({ limit: '1' });
  const cursor = first.nextCursor!;
  const ids = first.closings.map((r) => r.closing.id);
  let next: string | null = cursor;
  while (next) {
    const page: CashDiscrepancyResponse = await f.report({ limit: '1', cursor: next });
    ids.push(...page.closings.map((r) => r.closing.id));
    next = page.nextCursor;
  }
  expect(ids).toHaveLength(5);
  expect(new Set(ids).size).toBe(5);
  const request = (changes: Record<string, string>) =>
    `/cash-shifts/discrepancies?${f.query({ limit: '1', cursor, ...changes })}`;
  const cursorChanges: Record<string, string>[] = [
    { limit: '2' },
    { discrepancy: 'NONZERO' },
    { registerId: f.closings[0]!.register.id },
    { closedFrom: '2026-01-01' },
    { cursor: 'broken' },
    { locationId: f.otherLocation.id },
  ];
  for (const change of cursorChanges) {
    const session = change.locationId ? f.a.primary : actor;
    expect((await session.call(request(change))).status).toBe(400);
  }
  expect((await f.movementActors.reporter2!.session.call(request({}))).status).toBe(400);
  const options = await f.options({ limit: '1' });
  expect((await actor.call(request({ cursor: options.nextCursor }))).status).toBe(400);
  expect(
    (await actor.call(`/cash-shifts/discrepancy-registers?${f.query({ limit: '1', cursor })}`))
      .status,
  ).toBe(400);
  expect(
    (
      await f.movementActors.reporter2!.session.call(
        `/cash-shifts/discrepancy-registers?${f.query({ limit: '1', cursor: options.nextCursor })}`,
      )
    ).status,
  ).toBe(400);
  const updated = await f.a.primary.expect(`/locations/${f.locationId}`, 'PATCH', {
    version: f.a.location.version,
    timezone: 'Europe/London',
  });
  const renewed = await f.login(f.movementActors.reporter!);
  expect((await renewed.call(request({}))).status).toBe(400);
  expect(
    (
      await renewed.call(
        `/cash-shifts/discrepancy-registers?${f.query({ limit: '1', cursor: options.nextCursor })}`,
      )
    ).status,
  ).toBe(400);
  await f.a.primary.expect(`/locations/${f.locationId}`, 'PATCH', {
    version: updated.location.version,
    timezone: 'Europe/Chisinau',
  });
});

it('diferențe revocare: DENY pe oricare read golește accesul inclusiv cu cursor semnat anterior', async () => {
  const record = f.movementActors.reporter!;
  for (const permission of ['cash.registers.read', 'cash.shifts.read', 'cash.reports.read']) {
    const actor = await f.login(record);
    const first = await f.report({ limit: '1' }, actor);
    const options = await f.options({ limit: '1' }, actor);
    const denied = await f.a.primary.expect(`/staff/${record.userId}/overrides`, 'POST', {
      permission,
      effect: 'DENY',
      scopeType: 'LOCATION',
      locationId: f.locationId,
    });
    const revoked = await f.login(record);
    for (const [endpoint, cursor] of [
      ['discrepancies', first.nextCursor],
      ['discrepancy-registers', options.nextCursor],
    ]) {
      const response = await revoked.call(
        `/cash-shifts/${endpoint}?${f.query({ limit: '1', cursor })}`,
      );
      expect(response.status).toBe(403);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.data).not.toHaveProperty('closings');
      expect(response.data).not.toHaveProperty('registers');
    }
    await f.a.primary.expect(
      `/staff/${record.userId}/overrides/${denied.override.id}`,
      'DELETE',
      {},
    );
  }
});
