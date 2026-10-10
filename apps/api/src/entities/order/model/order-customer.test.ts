import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  customerCreationHash,
  customerLookupHash,
  normalizeCustomerName,
  orderCustomerColumns,
  readOrderCustomer,
} from './order-customer';

vi.mock('../../../shared/config', () => ({ config: { MFA_ENCRYPTION_KEY: 'a'.repeat(64) } }));
const context = { id: randomUUID(), organizationId: randomUUID(), locationId: randomUUID() };
const customer = { name: '  CLIENT   Sintetic  ', phone: '+373 (60) 000-001' };
describe('contactul capturat al comenzii', () => {
  it('criptează aleator și autentifică tenantul, locația și comanda', () => {
    const columns = orderCustomerColumns(context, customer);
    expect(columns.customerDataEncrypted).not.toBe(
      orderCustomerColumns(context, customer).customerDataEncrypted,
    );
    expect(columns.customerDataEncrypted).not.toContain('Sintetic');
    expect(readOrderCustomer({ ...context, ...columns })).toEqual({
      name: customer.name.trim(),
      phone: customer.phone,
    });
    for (const key of ['id', 'organizationId', 'locationId'])
      expect(() => readOrderCustomer({ ...context, ...columns, [key]: randomUUID() })).toThrow();
    const bytes = Buffer.from(columns.customerDataEncrypted!, 'base64url');
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    expect(() =>
      readOrderCustomer({
        ...context,
        ...columns,
        customerDataEncrypted: bytes.toString('base64url'),
      }),
    ).toThrow();
  });
  it('normalizează numai căutarea exactă fără să ghicească prefixul țării', () => {
    const org = context.organizationId;
    expect(normalizeCustomerName('  Ａna  Popescu ')).toBe('ana popescu');
    expect(customerLookupHash(org, 'name', customer.name)).toBe(
      customerLookupHash(org, 'name', 'client sintetic'),
    );
    expect(customerLookupHash(org, 'phone', customer.phone)).toBe(
      customerLookupHash(org, 'phone', '37360000001'),
    );
    expect(customerLookupHash(org, 'phone', customer.phone)).not.toBe(
      customerLookupHash(org, 'phone', '060000001'),
    );
    expect(customerLookupHash(org, 'name', '37360000001')).not.toBe(
      customerLookupHash(org, 'phone', '37360000001'),
    );
    expect(customerLookupHash(org, 'name', customer.name)).not.toBe(
      customerLookupHash(randomUUID(), 'name', customer.name),
    );
  });
  it('păstrează hashul vechi fără contact și contribuie stabil cu un HMAC pentru contact', () => {
    for (const value of [undefined, null, {}, { name: ' ', phone: '' }]) {
      expect(customerCreationHash(context.organizationId, value)).toBeNull();
      expect(orderCustomerColumns(context, value)).toEqual({
        customerDataEncrypted: null,
        customerNameLookupHash: null,
        customerPhoneLookupHash: null,
      });
    }
    expect(customerCreationHash(context.organizationId, customer)).toBe(
      customerCreationHash(context.organizationId, {
        name: 'client sintetic',
        phone: '37360000001',
      }),
    );
    expect(customerCreationHash(context.organizationId, customer)).not.toBe(
      customerCreationHash(context.organizationId, { ...customer, name: 'Alt client' }),
    );
  });
});
