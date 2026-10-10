import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareCashDiscrepancies } from './api/cash-discrepancies-setup';
import { closeOperations } from './api/operations-setup';
import type { CashDiscrepanciesFixture } from './api/cash-discrepancies.types';
import type {
  CashDiscrepancyResponse,
  CashDiscrepancyRegisterResponse,
} from '../packages/contracts/src/cash-discrepancies';

let f: CashDiscrepanciesFixture;
beforeAll(async () => {
  f = await prepareCashDiscrepancies();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('diferențe: reporter PIN fără orders/manage citește snapshoturi închise inclusiv case arhivate', async () => {
  const reporter = f.movementActors.reporter!.session;
  const response = await reporter.call(`/cash-shifts/discrepancies?${f.query()}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const result: CashDiscrepancyResponse = response.data;
  expect(result.timezone).toBe('Europe/Chisinau');
  expect(result.closings).toHaveLength(5);
  expect(result.closings.map((r) => r.shift.id)).not.toContain(f.open.shift.id);
  for (const original of f.closings) {
    const row = result.closings.find((r) => r.shift.id === original.shift.id)!;
    expect(row.closing).toEqual(original.closing);
    expect(row.shift).toMatchObject({
      registerName: original.shift.registerName,
      ownerDisplayName: original.shift.ownerDisplayName,
    });
  }
  expect(result.closings.map((r) => r.closing.difference).sort()).toEqual([
    '-1.00',
    '-1.00',
    '0.00',
    '1.00',
    '2.00',
  ]);
  const managed = result.closings.find((r) => r.closing.managerReason !== null)!;
  expect(managed.closing.closedByUserId).not.toBe(managed.shift.ownerUserId);
  expect(managed.closing.managerReason).toBe('Operatorul a părăsit locația');
  expect(managed.closing.discrepancyReason).toBe('Lipsă constată la predare');
  for (const secret of ['orderId', 'phone', 'receipt', 'products', 'address'])
    expect(JSON.stringify(result)).not.toContain(secret);
  expect(
    (await reporter.call(`/cash-registers?locationId=${f.locationId}&status=ARCHIVED`)).status,
  ).toBe(403);
  const nonzero: CashDiscrepancyResponse = await f.report({ discrepancy: 'NONZERO' });
  expect(nonzero.closings).toHaveLength(4);
  expect(nonzero.closings.every((r) => r.closing.difference !== '0.00')).toBe(true);
  expect((await f.report({ registerId: randomUUID() })).closings).toEqual([]);
});

it('diferențe: catalogul complet de opțiuni este independent de prima pagină și deduplică snapshotul redenumit', async () => {
  const first: CashDiscrepancyResponse = await f.report({ limit: '1' });
  expect(first.closings).toHaveLength(1);
  const ids: string[] = [];
  const names = new Map<string, string>();
  let cursor: string | null = null;
  do {
    const page: CashDiscrepancyRegisterResponse = await f.options({
      limit: '1',
      ...(cursor ? { cursor } : {}),
    });
    expect(page.timezone).toBe('Europe/Chisinau');
    for (const row of page.registers) {
      ids.push(row.registerId);
      names.set(row.registerId, row.registerName);
    }
    cursor = page.nextCursor;
  } while (cursor);
  expect(ids).toHaveLength(4);
  expect(new Set(ids).size).toBe(4);
  expect(ids).toEqual([...ids].sort());
  expect(names.get(f.closings[0]!.register.id)).toBe('Denumire nouă la a doua închidere');
  const nonzero: CashDiscrepancyRegisterResponse = await f.options({ discrepancy: 'NONZERO' });
  expect(nonzero.registers).toHaveLength(3);
  expect(nonzero.registers.map((r) => r.registerId)).not.toContain(f.closings[1]!.register.id);
  expect((await f.report({ registerId: f.closings[0]!.register.id })).closings).toHaveLength(2);
});

it('diferențe: filtre strict civile366/367, intervale vecine și limite valide fără fallback implicit', async () => {
  for (const endpoint of ['discrepancies', 'discrepancy-registers']) {
    const path = `/cash-shifts/${endpoint}`;
    const actor = f.movementActors.reporter!.session;
    expect((await actor.call(`${path}?locationId=${f.locationId}`)).status).toBe(400);
    expect(
      (await actor.call(`${path}?${f.query({ closedFrom: '2024-01-01', closedTo: '2024-12-31' })}`))
        .status,
    ).toBe(200);
    expect(
      (await actor.call(`${path}?${f.query({ closedFrom: '2024-01-01', closedTo: '2025-01-01' })}`))
        .status,
    ).toBe(400);
    const invalidChanges: Record<string, string>[] = [
      { closedFrom: '2026-02-30' },
      { closedFrom: '9999-01-01' },
      { closedFrom: '0000-01-01' },
      { closedFrom: '2026-02-02', closedTo: '2026-02-01' },
      { discrepancy: 'ZERO' },
      { limit: '101' },
      { from: f.date },
    ];
    for (const changes of invalidChanges)
      expect((await actor.call(`${path}?${f.query(changes)}`)).status).toBe(400);
    const empty = await actor.expect(
      `${path}?${f.query({ closedFrom: '9998-12-31', closedTo: '9998-12-31' })}`,
    );
    expect(empty[endpoint === 'discrepancies' ? 'closings' : 'registers']).toEqual([]);
    expect(empty.nextCursor).toBeNull();
  }
  const day = new Date(`${f.date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  const previous = day.toISOString().slice(0, 10);
  expect((await f.report({ closedFrom: previous, closedTo: previous })).closings).toEqual([]);
  const before = await Promise.all(f.closings.map((row) => f.detail(row.shift.id)));
  await f.report();
  await f.options();
  expect(await Promise.all(f.closings.map((row) => f.detail(row.shift.id)))).toEqual(before);
});
