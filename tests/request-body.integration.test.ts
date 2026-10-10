import { randomUUID } from 'node:crypto';
import { createOrderSchema } from '../packages/contracts/src';
import { expect, it } from 'vitest';
import { bases, BrowserSession, errorLog } from './api/support/harness';

it('returns 400 for malformed JSON without logging its content', async () => {
  const marker = `synthetic-body-${randomUUID()}`;
  const response = await fetch(`${bases.TENANT}/api/tenant/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: `{"login":"${marker}",`,
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: 'Corpul JSON nu este valid',
    code: 'INVALID_JSON',
  });
  expect(response.headers.get('x-request-id')).toMatch(/^[a-f\d-]{36}$/);
  expect(JSON.stringify(errorLog.mock.calls)).not.toContain(marker);
});

it('returns 413 for bodies above the bound before authentication', async () => {
  const response = await fetch(`${bases.PLATFORM}/api/platform/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: 'x'.repeat(128 * 1024) }),
  });
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({
    error: 'Cererea depășește limita permisă',
    code: 'BODY_TOO_LARGE',
  });
  expect(response.headers.get('x-request-id')).toMatch(/^[a-f\d-]{36}$/);
});

it('accepts parsing of a valid 50-line Unicode order but still requires authentication', async () => {
  const request = {
    locationId: randomUUID(),
    serviceType: 'DINE_IN',
    tableLabel: '1',
    notes: '餐'.repeat(1000),
    items: Array.from({ length: 50 }, () => ({
      productId: randomUUID(),
      quantity: '9999.999',
      note: '餐'.repeat(500),
    })),
    requestKey: randomUUID(),
  };
  expect(createOrderSchema.safeParse(request).success).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(request))).toBeGreaterThan(75 * 1024);
  const anonymous = new BrowserSession('TENANT');
  await anonymous.expect('/auth/session');
  const response = await anonymous.call('/orders', 'POST', request);
  expect(response.status).toBe(401);
  expect(response.data.code).not.toBe('BODY_TOO_LARGE');
});
