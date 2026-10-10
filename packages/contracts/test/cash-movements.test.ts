import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  cashMovementCreateSchema,
  cashMovementResolutionSchema,
  cashDiscrepancyQuerySchema,
  cashDiscrepancyRegisterQuerySchema,
  createRoleSchema,
  roleVersionSchema,
  createOverrideSchema,
  createDelegationSchema,
  accessPreviewSchema,
} from '../src';
it('mișcarea cere sumă pozitivă, motiv, versiune și țintă strictă', () => {
  const body = {
    locationId: randomUUID(),
    requestKey: randomUUID(),
    version: 1,
    direction: 'IN',
    amount: '20.00',
    reason: 'Fond suplimentar',
  };
  expect(cashMovementCreateSchema.parse(body)).toEqual(body);
  for (const amount of ['0', '-1', 'NaN', 'Infinity', '1.001'])
    expect(cashMovementCreateSchema.safeParse({ ...body, amount }).success).toBe(false);
  expect(cashMovementCreateSchema.safeParse({ ...body, reason: 'x' }).success).toBe(false);
  expect(cashMovementCreateSchema.safeParse({ ...body, managerReason: 'Excepție' }).success).toBe(
    false,
  );
  expect(
    cashMovementResolutionSchema.safeParse({
      locationId: body.locationId,
      requestKey: body.requestKey,
      kind: 'CASH_OUT',
      shiftId: randomUUID(),
    }).success,
  ).toBe(true);
});
it('limita cash.movements este doar maxAmount în toate schemele de acordare', () => {
  const scope = { scopeType: 'LOCATION', locationId: randomUUID() };
  const entry = { permission: 'cash.movements.create', limits: { maxPercent: '5' } };
  expect(createRoleSchema.safeParse({ name: 'Casier', permissions: [entry] }).success).toBe(false);
  expect(roleVersionSchema.safeParse({ permissions: [entry] }).success).toBe(false);
  expect(createOverrideSchema.safeParse({ ...scope, ...entry, effect: 'ALLOW' }).success).toBe(
    false,
  );
  expect(
    createDelegationSchema.safeParse({ ...scope, userId: randomUUID(), permissions: [entry] })
      .success,
  ).toBe(false);
  expect(accessPreviewSchema.safeParse({ ...scope, permissions: [entry] }).success).toBe(false);
  expect(
    createRoleSchema.safeParse({
      name: 'Casier',
      permissions: [{ ...entry, limits: { maxAmount: '10' } }],
    }).success,
  ).toBe(true);
});
it('raportul cere interval civil explicit, max366 inclusiv și ani reprezentabili', () => {
  const base = { locationId: randomUUID() };
  const valid = [
    ['2024-01-01', '2024-12-31'],
    ['0001-01-01', '0001-01-01'],
    ['9998-12-31', '9998-12-31'],
    ['2026-03-29', '2026-03-29'],
  ];
  for (const [closedFrom, closedTo] of valid)
    expect(cashDiscrepancyQuerySchema.safeParse({ ...base, closedFrom, closedTo }).success).toBe(
      true,
    );
  for (const [closedFrom, closedTo] of [
    ['2024-01-01', '2025-01-01'],
    ['2026-03-30', '2026-03-29'],
    ['0000-01-01', '0000-01-01'],
    ['9999-01-01', '9999-01-01'],
    ['2025-02-29', '2025-03-01'],
  ])
    expect(cashDiscrepancyQuerySchema.safeParse({ ...base, closedFrom, closedTo }).success).toBe(
      false,
    );
  expect(cashDiscrepancyQuerySchema.safeParse(base).success).toBe(false);
  expect(
    cashDiscrepancyRegisterQuerySchema.safeParse({
      ...base,
      closedFrom: '2026-01-01',
      closedTo: '2026-01-01',
      registerId: randomUUID(),
    }).success,
  ).toBe(false);
});
