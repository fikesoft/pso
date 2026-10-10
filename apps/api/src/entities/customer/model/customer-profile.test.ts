import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  customerProfileColumns,
  customerProfile,
  customerRegistrationHash,
  customerResponse,
} from './customer-profile';
import { customerLookupHash } from '../../../shared/lib/customer-identity';
import { domainHmac } from '../../../shared/lib/sealed-json';
vi.mock('../../../shared/config', () => ({ config: { MFA_ENCRYPTION_KEY: 'a'.repeat(64) } }));
const organizationId = randomUUID();
const actor = randomUUID();
const body = {
  locationId: randomUUID(),
  requestKey: randomUUID(),
  name: '  Ａna   Sintetic ',
  phone: '+373 (60) 000-001',
};
describe('profilul clientului explicit', () => {
  it('criptează separat de comandă și autentifică organizația/profilul', () => {
    const id = randomUUID();
    const row = {
      id,
      organizationId,
      createdByUserId: actor,
      createdLocationId: body.locationId,
      creationRequestKey: body.requestKey,
      creationRequestHash: 'a'.repeat(64),
      version: 1,
      createdAt: new Date(),
      ...customerProfileColumns(organizationId, id, body),
    };
    expect(customerResponse(row)).toEqual({
      id,
      version: 1,
      name: body.name.trim(),
      phone: body.phone,
    });
    expect(row.privateDataEncrypted).not.toContain('Sintetic');
    expect(customerProfileColumns(organizationId, id, body).privateDataEncrypted).not.toBe(
      row.privateDataEncrypted,
    );
    expect(() => customerResponse({ ...row, id: randomUUID() })).toThrow();
    expect(() => customerResponse({ ...row, organizationId: randomUUID() })).toThrow();
    const bytes = Buffer.from(row.privateDataEncrypted, 'base64url');
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    expect(() =>
      customerResponse({ ...row, privateDataEncrypted: bytes.toString('base64url') }),
    ).toThrow();
  });
  it('păstrează domeniul exact al lookupurilor istorice și leagă retry de actor/locație', () => {
    expect(customerLookupHash(organizationId, 'phone', body.phone)).toBe(
      domainHmac('order-customer-lookup-v1:phone', JSON.stringify([organizationId, '37360000001'])),
    );
    const hash = customerRegistrationHash(organizationId, actor, body);
    expect(hash).toBe(
      customerRegistrationHash(organizationId, actor, {
        ...body,
        name: 'ana sintetic',
        phone: '37360000001',
      }),
    );
    for (const changed of [
      { locationId: randomUUID() },
      { phone: '060000001' },
      { name: 'Alt client' },
    ])
      expect(customerRegistrationHash(organizationId, actor, { ...body, ...changed })).not.toBe(
        hash,
      );
    expect(customerRegistrationHash(organizationId, randomUUID(), body)).not.toBe(hash);
    expect(customerRegistrationHash(randomUUID(), actor, body)).not.toBe(hash);
  });
});

it('e-mailul rămâne criptat și nu intră în DTO-ul operațional; hashurile vechi rămân compatibile', () => {
  const id = randomUUID();
  const base = { id, organizationId, version: 1 };
  const row = {
    ...base,
    ...customerProfileColumns(organizationId, id, { ...body, email: 'crm@example.test' }),
  };
  expect(customerProfile(row).email).toBe('crm@example.test');
  expect(customerResponse(row)).not.toHaveProperty('email');
  expect(row.privateDataEncrypted).not.toContain('crm@example.test');
  expect(customerRegistrationHash(organizationId, actor, { ...body, email: null })).toBe(
    customerRegistrationHash(organizationId, actor, body),
  );
  expect(
    customerRegistrationHash(organizationId, actor, { ...body, email: 'crm@example.test' }),
  ).not.toBe(customerRegistrationHash(organizationId, actor, body));
});
