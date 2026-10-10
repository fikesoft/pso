import { expect, it } from 'vitest';
import type { CustomerManagementCommandResponse } from '@pos/contracts';
import type { CustomerPointer, CustomerPointerStorage } from '../model/customer-management.types';
import {
  clearCustomerPointer,
  customerPointerKey,
  readCustomerPointer,
  storeCustomerPointer,
  validateCustomerOutcome,
} from './customer-pointer';

function fixture() {
  const data = new Map<string, string>();
  const storage: CustomerPointerStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  const pointer: CustomerPointer = {
    organizationId: 'organization',
    actorUserId: 'actor',
    locationId: '00000000-0000-4000-8000-000000000001',
    customerId: '00000000-0000-4000-8000-000000000002',
    command: {
      locationId: '00000000-0000-4000-8000-000000000001',
      requestKey: '00000000-0000-4000-8000-000000000003',
      action: 'UPDATE',
    },
  };
  return { data, storage, pointer };
}
function outcome(): CustomerManagementCommandResponse {
  const { pointer } = fixture();
  return {
    status: 'SUCCEEDED',
    result: {
      customerId: pointer.customerId,
      requestKey: pointer.command.requestKey,
      action: 'UPDATE',
      expectedVersion: 1,
      version: 2,
      status: 'ACTIVE',
      occurredAt: '2026-10-04T00:00:00.000Z',
    },
    customer: {
      id: pointer.customerId,
      version: 2,
      name: 'Client test',
      phone: '+37360000001',
      email: null,
      status: 'ACTIVE',
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z',
    },
  };
}
it('păstrează numai identitatea și izolează organizația, actorul și locația', () => {
  const { storage, data, pointer } = fixture();
  storeCustomerPointer(storage, {
    ...pointer,
    profile: { phone: '+37360000001' },
  } as CustomerPointer);
  expect(readCustomerPointer(storage, pointer)).toEqual(pointer);
  expect(data.get(customerPointerKey(pointer))).not.toContain('phone');
  for (const patch of [
    { organizationId: 'other' },
    { actorUserId: 'other' },
    { locationId: 'other' },
  ])
    expect(readCustomerPointer(storage, { ...pointer, ...patch })).toBeNull();
  const other = { ...pointer, customerId: pointer.command.requestKey };
  expect(() => storeCustomerPointer(storage, other)).toThrow();
  expect(() => clearCustomerPointer(storage, other)).toThrow();
  expect(readCustomerPointer(storage, pointer)).toEqual(pointer);
  clearCustomerPointer(storage, pointer);
  expect(readCustomerPointer(storage, pointer)).toBeNull();
});
it('referințele corupte, cu date personale sau cu locație schimbată sunt respinse', () => {
  const { storage, data, pointer } = fixture();
  for (const value of [
    '{',
    'null',
    JSON.stringify({ ...pointer, actorUserId: 'other' }),
    JSON.stringify({ ...pointer, phone: '+37360000001' }),
    JSON.stringify({ ...pointer, customerId: 'bad' }),
    JSON.stringify({ ...pointer, command: { ...pointer.command, locationId: pointer.customerId } }),
    JSON.stringify({ ...pointer, command: { ...pointer.command, profile: { name: 'Test' } } }),
  ]) {
    data.set(customerPointerKey(pointer), value);
    expect(() => readCustomerPointer(storage, pointer)).toThrow();
  }
});
it('stocarea indisponibilă și ștergerea eșuată blochează continuarea', () => {
  const { pointer, storage, data } = fixture();
  expect(() => storeCustomerPointer({ ...storage, setItem: () => {} }, pointer)).toThrow();
  expect(() =>
    storeCustomerPointer(storage, {
      ...pointer,
      command: { ...pointer.command, locationId: pointer.customerId },
    }),
  ).toThrow();
  expect(data.size).toBe(0);
  storeCustomerPointer(storage, pointer);
  expect(() => clearCustomerPointer({ ...storage, removeItem: () => {} }, pointer)).toThrow();
});
it('acceptă rezultatul istoric împreună cu profilul curent arhivat ulterior', () => {
  const { pointer } = fixture();
  const value = outcome();
  value.customer = { ...value.customer, version: 3, status: 'ARCHIVED' };
  expect(validateCustomerOutcome(pointer, value)).toEqual(value);
  expect(
    validateCustomerOutcome(pointer, { ...value, status: 'RETIRED', result: null }).status,
  ).toBe('RETIRED');
});
it('respinge alt client, altă tentativă, altă versiune și profilul imposibil', () => {
  const { pointer } = fixture();
  const value = outcome();
  if (value.status !== 'SUCCEEDED') throw new Error('fixture');
  for (const result of [
    { ...value.result, customerId: pointer.command.requestKey },
    { ...value.result, requestKey: pointer.customerId },
    { ...value.result, action: 'RESTORE' as const },
    { ...value.result, version: 3 },
  ])
    expect(() => validateCustomerOutcome(pointer, { ...value, result })).toThrow();
  for (const customer of [
    { ...value.customer, id: pointer.command.requestKey },
    { ...value.customer, version: 1 },
    { ...value.customer, status: 'ARCHIVED' as const },
    { ...value.customer, email: 'invalid' },
  ])
    expect(() => validateCustomerOutcome(pointer, { ...value, customer })).toThrow();
  expect(() =>
    validateCustomerOutcome(pointer, value, {
      ...pointer.command,
      action: 'UPDATE',
      customerId: pointer.customerId,
      version: 2,
      profile: { name: null, phone: '+37360000001', email: null },
    }),
  ).toThrow();
});
