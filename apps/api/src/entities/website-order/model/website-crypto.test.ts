import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL ??= 'postgresql://test@127.0.0.1:55432/pos_test';
  process.env.AUTH_DATABASE_URL ??= process.env.DATABASE_URL;
  process.env.PLATFORM_DATABASE_URL ??= process.env.DATABASE_URL;
  process.env.CSRF_SECRET ??= 'c'.repeat(64);
  process.env.MFA_ENCRYPTION_KEY ??= 'a'.repeat(64);
});
it('cheile sunt aleatorii, legate de UUID și se verifică numai prin digest', async () => {
  const { generateWebsiteKey, websiteKeyHash } = await import('./website-crypto');
  const first = generateWebsiteKey();
  const second = generateWebsiteKey();
  expect(first.apiKey).not.toBe(second.apiKey);
  expect(first.apiKey).toContain(first.id);
  expect(first.secretHash).toMatch(/^[0-9a-f]{64}$/);
  expect(websiteKeyHash(first.apiKey)).toBe(first.secretHash);
  expect(websiteKeyHash(first.apiKey.replace(first.id, second.id))).not.toBe(first.secretHash);
});
it('datele private sunt autentificate și legate de comanda și tenantul corect', async () => {
  const { encryptWebsiteData, decryptWebsiteData } = await import('./website-crypto');
  const context = {
    id: randomUUID(),
    organizationId: randomUUID(),
    locationId: randomUUID(),
    connectionId: randomUUID(),
  };
  const data = {
    customer: { name: 'Client sintetic', phone: '+373000000' },
    delivery: { address: 'Adresă sintetică' },
    paymentMethod: 'CASH_ON_DELIVERY' as const,
  };
  const ciphertext = encryptWebsiteData(context, data);
  expect(ciphertext).not.toContain(data.customer.name);
  expect(decryptWebsiteData(context, ciphertext)).toEqual(data);
  for (const key of ['id', 'organizationId', 'locationId', 'connectionId'])
    expect(() => decryptWebsiteData({ ...context, [key]: randomUUID() }, ciphertext)).toThrow();
  const damaged = Buffer.from(ciphertext, 'base64');
  damaged[damaged.length - 1] = damaged[damaged.length - 1]! ^ 1;
  expect(() => decryptWebsiteData(context, damaged.toString('base64'))).toThrow();
});
