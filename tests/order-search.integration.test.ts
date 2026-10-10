import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareOrderSearch } from './api/order-search-setup';
import type { OrderSearchFixture } from './api/order-search.types';
import { closeOperations } from './api/operations-setup';
import { verifySearchDates } from './api/order-search-dates.cases';
import { verifySearchContacts } from './api/order-search-contacts.cases';
import { verifySearchPaging, verifySearchPermissions } from './api/order-search-access.cases';
import { noSecrets } from './api/support/harness';

let f: OrderSearchFixture;
beforeAll(async () => {
  f = await prepareOrderSearch();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('combines exact normalized name, full phone, number, author, source, status and local date with AND', async () => {
  const writer = await f.loginSearch(f.writer);
  const contact = { name: 'Ｍaria   Popescu', phone: '+373 (60) 123-456' };
  const target = await f.create({ customer: contact, source: 'PHONE' }, writer);
  const session = await writer.expect('/auth/session');
  const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' }).format(
    new Date(),
  );
  await f.create({
    customer: { name: 'Maria Popescu Junior', phone: '+373601234567' },
    source: 'PHONE',
  });
  const filters = {
    number: target.number,
    customerName: '  maria  popescu ',
    customerPhone: '373.60.123456',
    createdByUserId: session.user.id,
    source: 'PHONE',
    status: 'DRAFT',
    createdFrom: currentDate,
    createdTo: currentDate,
  };
  const result = await f.search(filters);
  expect(result.timezone).toBe('Europe/Chisinau');
  expect(result.orders.map((order: { id: string }) => order.id)).toEqual([target.id]);
  noSecrets(result);
  for (const change of [
    { number: target.number + 1000 },
    { customerName: 'Maria' },
    { customerPhone: '123456' },
    { customerPhone: '060123456' },
    { createdByUserId: f.hidden.user.id },
    { source: 'POS' },
    { source: 'UNKNOWN' },
    { status: 'CONFIRMED' },
    { createdFrom: '2001-01-01', createdTo: '2001-01-01' },
  ])
    expect((await f.search({ ...filters, ...change })).orders).toHaveLength(0);
  const invalid = await f.a.primary.call('/orders/search', 'POST', {
    locationId: f.a.location.id,
    createdFrom: '2026-03-31',
    createdTo: '2026-03-01',
  });
  expect(invalid.status).toBe(400);
  expect(
    (
      await f.a.primary.call('/orders/search', 'POST', {
        locationId: f.a.location.id,
        createdFrom: '2026-02-30',
      })
    ).status,
  ).toBe(400);
});

it('preserves encrypted manual and accepted website contacts, supports null and keeps side-channel histories private', async () => {
  await verifySearchContacts(f);
});

it('binds opaque keyset cursors to filters, caller, location and endpoint while retaining legacy GET cursors', async () => {
  await verifySearchPaging(f);
});

it('uses inclusive local calendar days with exact 23-hour and 25-hour DST boundaries', async () => {
  await verifySearchDates(f);
});

it('scans bounded sparse pages through amount limits and exposes only authorized order creators with current DENY', async () => {
  await verifySearchPermissions(f);
}, 60000);
