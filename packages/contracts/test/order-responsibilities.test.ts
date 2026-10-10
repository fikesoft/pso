import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  orderResponsibilityCommandSchema,
  orderResponsibilityResolutionSchema,
  orderResponsibilityListSchema,
} from '../src/order-responsibilities';
import {
  createRoleSchema,
  roleVersionSchema,
  createOverrideSchema,
  createDelegationSchema,
  accessPreviewSchema,
} from '../src';
it('responsabilitatea are ținte discriminate și recovery fără motive/sume', () => {
  const base = {
    locationId: randomUUID(),
    requestKey: randomUUID(),
    orderVersion: 2,
    responsibilityVersion: 0,
    reason: 'Asumare explicită',
  };
  const body = { ...base, kind: 'ASSIGN', targetShiftId: randomUUID() };
  expect(orderResponsibilityCommandSchema.parse(body)).toEqual(body);
  for (const extra of [
    { sourceShiftId: randomUUID() },
    { managerReason: 'Excepție' },
    { responsibilityVersion: -1 },
    { reason: 'x' },
  ])
    expect(orderResponsibilityCommandSchema.safeParse({ ...body, ...extra }).success).toBe(false);
  expect(orderResponsibilityResolutionSchema.safeParse(body).success).toBe(false);
  expect(
    orderResponsibilityResolutionSchema.safeParse({
      locationId: base.locationId,
      requestKey: base.requestKey,
      kind: 'ASSIGN',
      targetShiftId: body.targetShiftId,
    }).success,
  ).toBe(true);
  expect(
    orderResponsibilityListSchema.safeParse({
      locationId: base.locationId,
      view: 'PENDING',
      shiftId: body.targetShiftId,
    }).success,
  ).toBe(false);
});
it('toate payloadurile de atribuire resping limitele pentru noile acțiuni', () => {
  const scope = { scopeType: 'LOCATION', locationId: randomUUID() };
  for (const permission of ['orders.handoff', 'orders.handoff-others'])
    for (const limits of [{ maxAmount: '10' }, { maxPercent: '10' }]) {
      const entry = { permission, limits };
      expect(createRoleSchema.safeParse({ name: 'Casier', permissions: [entry] }).success).toBe(
        false,
      );
      expect(roleVersionSchema.safeParse({ permissions: [entry] }).success).toBe(false);
      expect(createOverrideSchema.safeParse({ ...scope, ...entry, effect: 'ALLOW' }).success).toBe(
        false,
      );
      expect(
        createDelegationSchema.safeParse({ ...scope, userId: randomUUID(), permissions: [entry] })
          .success,
      ).toBe(false);
      expect(accessPreviewSchema.safeParse({ ...scope, permissions: [entry] }).success).toBe(false);
    }
});
