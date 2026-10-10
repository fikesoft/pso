import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  createRoleSchema,
  roleVersionSchema,
  createDelegationSchema,
  createOverrideSchema,
  accessPreviewSchema,
  collectPaymentSchema,
  refundPaymentSchema,
  manualCheckoutSchema,
  demoCheckoutSchema,
  cashShiftOpenSchema,
  cashShiftCloseSchema,
  cashShiftResolutionSchema,
} from '../src';

it('limitele nesuportate sunt respinse în toate payloadurile de atribuire', () => {
  const scope = { scopeType: 'LOCATION', locationId: randomUUID() };
  for (const permission of [
    'cash.shifts.read',
    'cash.shifts.close',
    'cash.shifts.close-others',
    'cash.reports.read',
    'cash.shifts.open',
  ]) {
    for (const limits of [
      { maxPercent: '5' },
      ...(permission === 'cash.shifts.open' ? [] : [{ maxAmount: '5' }]),
    ]) {
      const entry = { permission, limits };
      expect(createRoleSchema.safeParse({ name: 'Casier', permissions: [entry] }).success).toBe(
        false,
      );
      expect(roleVersionSchema.safeParse({ permissions: [entry] }).success).toBe(false);
      expect(
        createDelegationSchema.safeParse({ userId: randomUUID(), ...scope, permissions: [entry] })
          .success,
      ).toBe(false);
      expect(createOverrideSchema.safeParse({ ...scope, ...entry, effect: 'ALLOW' }).success).toBe(
        false,
      );
      expect(accessPreviewSchema.safeParse({ ...scope, permissions: [entry] }).success).toBe(false);
    }
  }
  expect(
    createRoleSchema.safeParse({
      name: 'Casier',
      permissions: [{ permission: 'cash.shifts.open', limits: { maxAmount: '100' } }],
    }).success,
  ).toBe(true);
});

it('corpurile istorice fără tură rămân identice la parsare, iar DEMO refuză asocierea', () => {
  const base = { version: 1, requestKey: randomUUID() };
  const collect = { ...base, confirmed: true, payments: [{ method: 'CARD', amount: '1.00' }] };
  const refund = {
    ...base,
    confirmed: true,
    reason: 'Retur test',
    refunds: [{ paymentId: randomUUID(), amount: '1.00' }],
  };
  const manual = { ...base, method: 'CARD', confirmed: true };
  expect(collectPaymentSchema.parse(collect)).toEqual(collect);
  expect(refundPaymentSchema.parse(refund)).toEqual(refund);
  expect(manualCheckoutSchema.parse(manual)).toEqual(manual);
  expect(demoCheckoutSchema.parse(base)).toEqual(base);
  expect(demoCheckoutSchema.safeParse({ ...base, cashShiftId: randomUUID() }).success).toBe(false);
  expect(collectPaymentSchema.safeParse({ ...collect, cashShiftId: null }).success).toBe(false);
});

it('OPEN/CLOSE și resolverele au câmpuri stricte, motive și ținte tipizate', () => {
  const common = { locationId: randomUUID(), requestKey: randomUUID() };
  expect(cashShiftOpenSchema.safeParse({ ...common, openingAmount: '0.00' }).success).toBe(true);
  expect(cashShiftOpenSchema.safeParse({ ...common, openingAmount: '-1' }).success).toBe(false);
  expect(
    cashShiftCloseSchema.safeParse({
      ...common,
      version: 1,
      countedCash: '0',
      discrepancyReason: 'x',
    }).success,
  ).toBe(false);
  expect(
    cashShiftResolutionSchema.safeParse({ ...common, kind: 'OPEN', shiftId: randomUUID() }).success,
  ).toBe(false);
  expect(
    cashShiftResolutionSchema.safeParse({ ...common, kind: 'CLOSE', shiftId: randomUUID() })
      .success,
  ).toBe(true);
});
