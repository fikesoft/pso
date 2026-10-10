import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  customerManagementCommandSchema,
  customerManagementResolutionSchema,
  customerManagementResultSchema,
  customerManagementSearchSchema,
} from './customer-management.schema';

it('separă editarea explicită de arhivare/restaurare și refuză metadatele impuse de client', () => {
  const base = { locationId: randomUUID(), requestKey: randomUUID(), version: 1 };
  const profile = { name: '  Client sintetic  ', phone: '+373 (60) 123-456', email: null };
  expect(customerManagementCommandSchema.parse({ ...base, action: 'UPDATE', profile })).toEqual({
    ...base,
    action: 'UPDATE',
    profile: { ...profile, name: 'Client sintetic' },
  });
  for (const action of ['ARCHIVE', 'RESTORE']) {
    expect(customerManagementCommandSchema.safeParse({ ...base, action }).success).toBe(true);
    expect(customerManagementCommandSchema.safeParse({ ...base, action, profile }).success).toBe(
      false,
    );
  }
  for (const changed of [
    { version: 0 },
    { version: 1.5 },
    { version: 2147483647 },
    { organizationId: randomUUID() },
    { actorUserId: randomUUID() },
    { status: 'ACTIVE' },
    { profile: { ...profile, phone: '' } },
    { profile: { ...profile, email: 'fără adresă' } },
    { profile: { name: 'Incomplet' } },
  ])
    expect(
      customerManagementCommandSchema.safeParse({ ...base, action: 'UPDATE', profile, ...changed })
        .success,
    ).toBe(false);
});

it('recuperarea nu acceptă contactul și căutarea exactă verifică telefonul și limitele', () => {
  const locationId = randomUUID();
  const resolution = { locationId, requestKey: randomUUID(), action: 'UPDATE' };
  expect(customerManagementResolutionSchema.safeParse(resolution).success).toBe(true);
  expect(
    customerManagementResolutionSchema.safeParse({ ...resolution, phone: '060123456' }).success,
  ).toBe(false);
  const search = { locationId, field: 'PHONE', query: ' +373 (60) 123-456 ' };
  expect(customerManagementSearchSchema.parse(search)).toMatchObject({
    query: '+373 (60) 123-456',
    status: 'ACTIVE',
    limit: 50,
  });
  expect(customerManagementSearchSchema.safeParse({ ...search, query: 'Ana' }).success).toBe(false);
  expect(
    customerManagementSearchSchema.safeParse({ ...search, field: 'NAME', query: 'Ana' }).success,
  ).toBe(true);
  for (const changed of [{ limit: 101 }, { query: ' ' }, { cursor: '' }, { status: 'DELETED' }])
    expect(customerManagementSearchSchema.safeParse({ ...search, ...changed }).success).toBe(false);
});

it('rezultatul confirmat leagă acțiunea de versiunea și starea efectivă, fără contact', () => {
  const result = {
    customerId: randomUUID(),
    requestKey: randomUUID(),
    action: 'ARCHIVE',
    expectedVersion: 4,
    version: 5,
    status: 'ARCHIVED',
    occurredAt: new Date().toISOString(),
  };
  expect(customerManagementResultSchema.safeParse(result).success).toBe(true);
  for (const changed of [
    { version: 4 },
    { version: 6 },
    { status: 'ACTIVE' },
    { action: 'RESTORE' },
    { email: 'client@example.test' },
  ])
    expect(customerManagementResultSchema.safeParse({ ...result, ...changed }).success).toBe(false);
});
