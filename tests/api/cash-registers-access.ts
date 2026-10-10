import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { noSecrets } from './support/harness';
import type { CashRegistersFixture } from './cash-registers.types';

export async function verifyRegisterAccess(f: CashRegistersFixture) {
  const { manager, reader, manageOnly, denied, preMfa } = f.actors;
  const body = f.body();
  const result = await manager!.session.call('/cash-registers', 'POST', body);
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('no-store');
  const register = result.data.register;
  noSecrets(register);
  expect(register).not.toHaveProperty('organizationId');
  const query = `/cash-registers?locationId=${f.a.location.id}`;
  const read = await reader!.session.call(query);
  expect(read.status).toBe(200);
  expect(read.headers.get('cache-control')).toBe('no-store');
  expect(read.data.registers).toContainEqual(register);
  for (const actor of [reader!, manageOnly!, denied!, preMfa!]) {
    expect((await actor.session.call('/cash-registers', 'POST', f.body())).status).toBe(403);
    expect(
      (
        await actor.session.call(`/cash-registers/${register.id}`, 'PATCH', {
          ...body,
          code: undefined,
          name: 'Interzis',
          version: 1,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await actor.session.call('/cash-register-commands/resolution', 'POST', {
          locationId: body.locationId,
          requestKey: body.requestKey,
          kind: 'CREATE',
        })
      ).status,
    ).toBe(403);
  }
  expect((await manageOnly!.session.call(query)).status).toBe(403);
  expect((await reader!.session.call(`${query}&status=ALL`)).status).toBe(403);
  expect(
    (await manager!.session.call(`/cash-registers?locationId=${f.otherLocation.id}`)).status,
  ).toBe(403);
  expect(
    (
      await manager!.session.call('/cash-registers', 'POST', {
        ...f.body(),
        locationId: f.otherLocation.id,
      })
    ).status,
  ).toBe(403);
  expect(
    (await f.b.primary.call(`/cash-registers/${register.id}?locationId=${f.b.location.id}`)).status,
  ).toBe(404);
  expect(
    (
      await f.b.primary.call(`/cash-registers/${register.id}`, 'PATCH', {
        locationId: f.b.location.id,
        name: 'Străin',
        requestKey: randomUUID(),
        version: 1,
      })
    ).status,
  ).toBe(404);
  expect(
    (await f.a.primary.call(`/cash-registers/${register.id}?locationId=${f.otherLocation.id}`))
      .status,
  ).toBe(404);
  expect((await manager!.session.call('/cash-registers', 'POST', f.body(), {}, false)).status).toBe(
    403,
  );
  expect(
    (
      await manager!.session.call('/cash-registers', 'POST', f.body(), {
        origin: 'http://127.0.0.1:9',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await manager!.session.call('/cash-registers', 'POST', {
        ...f.body(),
        organizationId: f.a.company.organization.id,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await manager!.session.call('/cash-registers', 'POST', f.body(), {
        'idempotency-key': randomUUID(),
      })
    ).status,
  ).toBe(400);
  await manager!.session.expect(`/cash-registers/${register.id}/archive`, 'POST', {
    locationId: body.locationId,
    requestKey: randomUUID(),
    version: 1,
  });
  expect(
    (await reader!.session.call(`/cash-registers/${register.id}?locationId=${body.locationId}`))
      .status,
  ).toBe(403);
  expect(
    (await reader!.session.expect(query)).registers.some(
      (row: { id: string }) => row.id === register.id,
    ),
  ).toBe(false);
}
