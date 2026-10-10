import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CustomerAddressFixture } from './customer-address.types';

export async function verifyAddressScopes(f: CustomerAddressFixture) {
  const { address } = await f.a.primary.expect(f.path(), 'POST', f.addressBody());
  const archive = { locationId: f.a.location.id, version: 1, requestKey: randomUUID() };
  const resolution = { locationId: f.a.location.id, requestKey: randomUUID() };
  for (const account of [f.reader, f.writer]) {
    const actor = await f.loginCustomer(account);
    expect(
      (await actor.expect(f.listPath())).addresses.map((value: { id: string }) => value.id),
    ).toContain(address.id);
    expect((await actor.call(f.path(), 'POST', f.addressBody())).status).toBe(403);
    expect((await actor.call(`${f.path()}/${address.id}/archive`, 'POST', archive)).status).toBe(
      403,
    );
    expect((await actor.call(`${f.path()}/creation-resolution`, 'POST', resolution)).status).toBe(
      403,
    );
    expect(
      (
        await actor.expect(
          '/orders',
          'POST',
          f.draft({
            serviceType: 'DELIVERY',
            customerRef: { id: f.customer.id, version: 1 },
            addressRef: { id: address.id, version: 1 },
          }),
        )
      ).order.addressRef.id,
    ).toBe(address.id);
  }
  const basic = await f.loginCustomer(f.basic);
  expect((await basic.call(f.listPath())).status).toBe(403);
  await f.a.primary.expect(`/staff/${f.createOnly.actor.user.id}/overrides`, 'POST', {
    permission: 'customers.addresses.manage',
    effect: 'ALLOW',
    scopeType: 'ORGANIZATION',
  });
  const manageWithoutRead = await f.loginCustomer(f.createOnly);
  expect((await manageWithoutRead.call(f.listPath())).status).toBe(403);
  expect((await manageWithoutRead.call(f.path(), 'POST', f.addressBody())).status).toBe(403);
  const restricted = await f.loginAddress(f.restrictedManager);
  expect((await restricted.call(f.listPath(f.customer.id, f.otherLocation.id))).status).toBe(403);
  expect(
    (await restricted.call(f.path(), 'POST', f.addressBody({ locationId: f.otherLocation.id })))
      .status,
  ).toBe(403);
  const manager = await f.loginAddress();
  expect((await manager.call(f.listPath(f.foreignCustomer.id))).status).toBe(404);
  expect((await f.b.primary.call(f.listPath(f.customer.id, f.b.location.id))).status).toBe(404);
  expect((await manager.call(f.path(f.foreignCustomer.id), 'POST', f.addressBody())).status).toBe(
    404,
  );
  expect(
    (
      await f.a.primary.call(`/staff/${f.basic.actor.user.id}/overrides`, 'POST', {
        permission: 'customers.addresses.manage',
        effect: 'ALLOW',
        scopeType: 'LOCATION',
        locationId: f.a.location.id,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.a.primary.call('/staff', 'POST', {
        login: 'invalid-address-local',
        displayName: 'Adresă locală invalidă',
        authenticationMethod: 'PIN',
        locationIds: [f.a.location.id],
        assignments: [
          {
            roleVersionId: f.role.versions[0].id,
            scopeType: 'LOCATION',
            locationId: f.a.location.id,
          },
        ],
      })
    ).status,
  ).toBe(403);
  const inactive = (
    await f.a.primary.expect('/locations', 'POST', { name: 'Adresă inactivă', code: 'ADR-OFF' })
  ).location;
  await f.a.primary.expect(`/locations/${inactive.id}`, 'PATCH', {
    version: inactive.version,
    status: 'DISABLED',
  });
  expect((await f.a.primary.call(f.listPath(f.customer.id, inactive.id))).status).toBe(403);
  expect(
    (await f.a.primary.call(f.path(), 'POST', f.addressBody({ locationId: inactive.id }))).status,
  ).toBe(403);
}

export async function verifyAddressRevocation(f: CustomerAddressFixture) {
  const actor = await f.loginAddress();
  const body = f.addressBody();
  const { address } = await actor.expect(f.path(), 'POST', body);
  const archive = { locationId: body.locationId, version: 1, requestKey: randomUUID() };
  const archived = await actor.expect(`${f.path()}/${address.id}/archive`, 'POST', archive);
  const second = await f.loginAddress(f.otherManager);
  expect((await second.call(`${f.path()}/${address.id}/archive`, 'POST', archive)).status).toBe(
    409,
  );
  const linkedBody = f.addressBody();
  const linked = (await second.expect(f.path(), 'POST', linkedBody)).address;
  const orderBody = f.draft({
    serviceType: 'DELIVERY',
    customerRef: { id: f.customer.id, version: 1 },
    addressRef: { id: linked.id, version: 1 },
  });
  const order = (await second.expect('/orders', 'POST', orderBody)).order;
  await f.a.primary.expect(`/staff/${f.manager.user.id}/overrides`, 'POST', {
    permission: 'customers.addresses.manage',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const noManage = await f.loginAddress();
  expect((await noManage.call(f.path(), 'POST', body)).status).toBe(403);
  expect(
    (
      await noManage.call(`${f.path()}/creation-resolution`, 'POST', {
        locationId: body.locationId,
        requestKey: body.requestKey,
      })
    ).status,
  ).toBe(403);
  expect((await noManage.call(`${f.path()}/${address.id}/archive`, 'POST', archive)).status).toBe(
    403,
  );
  expect((await noManage.call(f.listPath())).status).toBe(200);
  expect(archived.address.status).toBe('ARCHIVED');
  await f.a.primary.expect(`/staff/${f.otherManager.user.id}/overrides`, 'POST', {
    permission: 'customers.read',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const noRead = await f.loginAddress(f.otherManager);
  expect((await noRead.call(f.path(), 'POST', linkedBody)).status).toBe(403);
  expect((await noRead.call(f.listPath())).status).toBe(403);
  expect(
    (
      await noRead.call(`${f.path()}/creation-resolution`, 'POST', {
        locationId: body.locationId,
        requestKey: linkedBody.requestKey,
      })
    ).status,
  ).toBe(403);
  expect((await noRead.call('/orders', 'POST', orderBody)).status).toBe(403);
  expect(
    (
      await noRead.call('/orders/creation-resolution', 'POST', {
        locationId: body.locationId,
        requestKey: orderBody.requestKey,
      })
    ).status,
  ).toBe(403);
  expect((await noRead.expect(`/orders/${order.id}`)).order.deliveryAddress).toEqual(
    order.deliveryAddress,
  );
}
