import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { customerAddressCreateSchema } from '@pos/contracts';
import {
  addressProfileColumns,
  customerAddressResponse,
  addressCreationHash,
  addressArchiveHash,
} from '../../../entities/customer-address';
import { orderAddressColumns, readOrderAddress } from '../../../entities/order';
vi.mock('../../../shared/config', () => ({ config: { MFA_ENCRYPTION_KEY: 'a'.repeat(64) } }));
const organizationId = randomUUID(),
  customerId = randomUUID(),
  id = randomUUID(),
  actor = randomUUID();
const context = { organizationId, id: randomUUID(), locationId: randomUUID() };
function profile(body: { address: string; label?: string | null; instructions?: string | null }) {
  return {
    id,
    organizationId,
    customerId,
    createdLocationId: context.locationId,
    createdByUserId: actor,
    status: 'ACTIVE',
    version: 1,
    creationRequestKey: randomUUID(),
    creationRequestHash: 'a'.repeat(64),
    createdAt: new Date(),
    archivedAt: null,
    archivedByUserId: null,
    archivedLocationId: null,
    archiveRequestKey: null,
    archiveRequestHash: null,
    ...addressProfileColumns(organizationId, customerId, id, body),
  };
}
it('criptarea adresarului și snapshotului este separată, autentificată și nu include eticheta în hashul snapshotului', () => {
  const input = { address: ' Stradă sintetică 1 ', instructions: '  Etaj 2  ', label: 'Acasă' };
  const row = profile(input),
    order = orderAddressColumns(context, input);
  expect(customerAddressResponse(row).address).toBe(input.address.trim());
  expect(readOrderAddress({ ...context, ...order })).toEqual({
    address: 'Stradă sintetică 1',
    instructions: 'Etaj 2',
  });
  expect(row.snapshotHash).toBe(order.deliveryAddressHash);
  expect(profile({ ...input, label: 'Altă etichetă' }).snapshotHash).toBe(row.snapshotHash);
  expect(profile(input).privateDataEncrypted).not.toBe(row.privateDataEncrypted);
  expect(() => customerAddressResponse({ ...row, id: randomUUID() })).toThrow();
  expect(() => customerAddressResponse({ ...row, customerId: randomUUID() })).toThrow();
  expect(() => customerAddressResponse({ ...row, organizationId: randomUUID() })).toThrow();
  expect(() => readOrderAddress({ ...context, ...order, locationId: randomUUID() })).toThrow();
  expect(() =>
    readOrderAddress({ ...context, ...order, deliveryAddressEncrypted: row.privateDataEncrypted }),
  ).toThrow();
});
it('maximele Unicode și JSON-escaped încap în16384 fără trunchiere', () => {
  for (const char of ['漢', '\u0001']) {
    const input = {
      address: char.repeat(500),
      instructions: char.repeat(500),
      label: char.repeat(80),
    };
    const body = customerAddressCreateSchema.parse({
      ...input,
      locationId: context.locationId,
      requestKey: randomUUID(),
    });
    const row = profile(body),
      order = orderAddressColumns(context, body);
    expect(row.privateDataEncrypted.length).toBeLessThanOrEqual(16384);
    expect(order.deliveryAddressEncrypted!.length).toBeLessThanOrEqual(16384);
    expect(customerAddressResponse(row)).toMatchObject(input);
    expect(readOrderAddress({ ...context, ...order })).toEqual({
      address: input.address,
      instructions: input.instructions,
    });
  }
});
it('identitățile cererilor leagă autorul/contextul/corpul și arhivarea de versiune', () => {
  const body = {
    locationId: context.locationId,
    requestKey: randomUUID(),
    address: ' Adresă 1 ',
    instructions: ' ',
    label: ' ',
  };
  const hash = addressCreationHash(organizationId, customerId, actor, body);
  expect(
    addressCreationHash(organizationId, customerId, actor, {
      ...body,
      address: 'Adresă 1',
      instructions: null,
      label: null,
    }),
  ).toBe(hash);
  expect(addressCreationHash(organizationId, customerId, randomUUID(), body)).not.toBe(hash);
  expect(addressCreationHash(organizationId, randomUUID(), actor, body)).not.toBe(hash);
  expect(
    addressCreationHash(organizationId, customerId, actor, { ...body, locationId: randomUUID() }),
  ).not.toBe(hash);
  expect(
    addressCreationHash(organizationId, customerId, actor, { ...body, label: 'Nou' }),
  ).not.toBe(hash);
  const archive = { locationId: context.locationId, requestKey: randomUUID(), version: 1 };
  expect(addressArchiveHash(organizationId, customerId, id, actor, archive)).not.toBe(
    addressArchiveHash(organizationId, customerId, id, actor, { ...archive, version: 2 }),
  );
});
