import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareCustomerLookup } from './api/customer-lookup-setup';
import type { CustomerLookupFixture } from './api/customer-lookup.types';
import { closeOperations } from './api/operations-setup';
import { verifyCustomerReferences } from './api/customer-lookup-references.cases';
import { verifyCustomerAccess } from './api/customer-lookup-access.cases';
import { noSecrets } from './api/support/harness';

let f: CustomerLookupFixture;
beforeAll(async () => {
  f = await prepareCustomerLookup();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('looks up exact normalized full phones without creating profiles or guessing a country prefix', async () => {
  const body = f.registration({ phone: '+373 (60) 123-456', name: '  Ana Test  ' });
  expect(await f.lookup(body.phone)).toEqual({ customer: null });
  expect(await f.lookup(body.phone)).toEqual({ customer: null });
  const created = await f.a.primary.expect('/customers', 'POST', body);
  expect(Object.keys(created.customer).sort()).toEqual(['id', 'name', 'phone', 'version']);
  expect(created.customer.version).toBe(1);
  for (const phone of ['37360123456', ' +373.60.123456 ', '+373 (60) 123-456'])
    expect(await f.lookup(phone)).toEqual(created);
  for (const phone of ['060123456', '123456'])
    expect(await f.lookup(phone)).toEqual({ customer: null });
  for (const phone of ['', 'abc', '37360%'])
    expect(
      (await f.a.primary.call('/customers/lookup', 'POST', { locationId: f.a.location.id, phone }))
        .status,
    ).toBe(400);
  expect(
    (
      await f.a.primary.call('/customers/lookup', 'POST', {
        locationId: f.a.location.id,
        phone: body.phone,
        organizationId: f.b.company.organization.id,
      })
    ).status,
  ).toBe(400);
  noSecrets(created);
});

it('registers once under same-key races and refuses conflicting bodies, duplicate phones and mismatched headers', async () => {
  const actor = await f.loginCustomer();
  const body = f.registration();
  const accepted = await Promise.all(
    Array.from({ length: 3 }, () => actor.expect('/customers', 'POST', body)),
  );
  expect(new Set(accepted.map((value) => value.customer.id)).size).toBe(1);
  expect(await actor.expect('/customers', 'POST', body)).toEqual(accepted[0]);
  expect((await actor.call('/customers', 'POST', { ...body, name: 'Alt nume' })).status).toBe(409);
  const duplicate = await actor.call('/customers', 'POST', { ...body, requestKey: randomUUID() });
  expect(duplicate.status).toBe(409);
  expect(duplicate.data.code).toBe('CUSTOMER_PHONE_EXISTS');
  const mismatch = f.registration();
  expect(
    (await actor.call('/customers', 'POST', mismatch, { 'Idempotency-Key': randomUUID() })).status,
  ).toBe(400);
  expect(await f.lookup(mismatch.phone)).toEqual({ customer: null });
  expect(
    (await actor.call('/customers', 'POST', mismatch, { 'Idempotency-Key': mismatch.requestKey }))
      .status,
  ).toBe(200);
  const competing = f.registration();
  const results = await Promise.all([
    actor.call('/customers', 'POST', competing),
    actor.call('/customers', 'POST', { ...competing, name: 'Nume concurent' }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const distinct = f.registration();
  const duplicates = await Promise.all([
    actor.call('/customers', 'POST', distinct),
    actor.call('/customers', 'POST', { ...distinct, requestKey: randomUUID() }),
  ]);
  expect(duplicates.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(duplicates.find((result) => result.status === 409)!.data.code).toBe(
    'CUSTOMER_PHONE_EXISTS',
  );
});

it('binds registration replay to actor and location without preventing independent tenant profiles', async () => {
  const body = f.registration();
  const actor = await f.loginCustomer();
  const created = await actor.expect('/customers', 'POST', body);
  expect(
    (await (await f.loginCustomer(f.secondWriter)).call('/customers', 'POST', body)).status,
  ).toBe(409);
  expect(
    (await actor.call('/customers', 'POST', { ...body, locationId: f.otherLocation.id })).status,
  ).toBe(409);
  expect(await f.lookup(body.phone, actor, f.otherLocation.id)).toEqual(created);
  expect(await f.lookup(body.phone, f.b.primary, f.b.location.id)).toEqual({ customer: null });
  const foreign = await f.b.primary.expect('/customers', 'POST', {
    ...body,
    locationId: f.b.location.id,
    name: 'Alt tenant',
  });
  expect(foreign.customer.id).not.toBe(created.customer.id);
  expect(await f.lookup(body.phone)).toEqual(created);
  expect(await f.lookup(body.phone, f.b.primary, f.b.location.id)).toEqual(foreign);
});

it('keeps manual and accepted website contacts separate from registration and explicit customer references', async () => {
  const phone = '060999111';
  const manual = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({ customer: { name: 'Contact manual', phone } }),
    )
  ).order;
  expect(manual.customerRef).toBeNull();
  expect(await f.lookup(phone)).toEqual({ customer: null });
  const registered = await f.a.primary.expect('/customers', 'POST', f.registration({ phone }));
  const second = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({ customer: { name: 'Contact independent', phone } }),
    )
  ).order;
  expect(second.customerRef).toBeNull();
  expect(second.customer.name).toBe('Contact independent');
  expect(await f.lookup(phone)).toEqual(registered);
  const websitePhone = '060999222';
  const body = f.order({ customer: { name: 'Contact website', phone: websitePhone } });
  const received = await f.inbound('/orders', 'POST', body);
  expect(received.status).toBe(200);
  const accepted = await f.a.primary.expect(
    `/website/orders/${received.data.receipt.id}/accept`,
    'POST',
    { version: 1 },
  );
  expect((await f.a.primary.expect(`/orders/${accepted.orderId}`)).order.customerRef).toBeNull();
  expect(await f.lookup(websitePhone)).toEqual({ customer: null });
});

it('selects versioned references explicitly and preserves immutable order snapshots when links are detached', async () => {
  await verifyCustomerReferences(f);
});

it('requires explicit organization grants, active location membership and current authorization on replay', async () => {
  await verifyCustomerAccess(f);
});
