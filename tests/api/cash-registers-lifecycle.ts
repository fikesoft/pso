import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CashRegistersFixture } from './cash-registers.types';

export async function verifyRegisterLifecycle(f: CashRegistersFixture) {
  const actor = f.actors.manager!.session;
  const body = { ...f.body(), code: '  pos_immutable  ', name: '  Casă inițială  ' };
  const created = await actor.expect('/cash-registers', 'POST', body);
  expect(created.register).toMatchObject({
    code: 'POS_IMMUTABLE',
    name: 'Casă inițială',
    status: 'ACTIVE',
    version: 1,
  });
  const id = created.register.id;
  const rename = {
    locationId: body.locationId,
    requestKey: randomUUID(),
    version: 1,
    name: 'Casă redenumită',
  };
  const changed = await actor.expect(`/cash-registers/${id}`, 'PATCH', rename);
  expect(changed.register).toMatchObject({
    id,
    code: 'POS_IMMUTABLE',
    name: rename.name,
    version: 2,
  });
  expect(
    (await actor.call(`/cash-registers/${id}`, 'PATCH', { ...rename, requestKey: randomUUID() }))
      .status,
  ).toBe(409);
  expect(
    (
      await actor.call(`/cash-registers/${id}`, 'PATCH', {
        ...rename,
        code: 'MUTABLE',
        version: 2,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(400);
  const archive = { locationId: body.locationId, requestKey: randomUUID(), version: 2 };
  const archived = await actor.expect(`/cash-registers/${id}/archive`, 'POST', archive);
  expect(archived.register).toMatchObject({
    id,
    status: 'ARCHIVED',
    version: 3,
    name: rename.name,
  });
  expect(await actor.expect('/cash-registers', 'POST', body)).toEqual(created);
  expect(await actor.expect(`/cash-registers/${id}`, 'PATCH', rename)).toEqual(changed);
  expect(await actor.expect(`/cash-registers/${id}/archive`, 'POST', archive)).toEqual(archived);
  const resolved = await actor.expect('/cash-register-commands/resolution', 'POST', {
    locationId: body.locationId,
    requestKey: body.requestKey,
    kind: 'CREATE',
  });
  expect(resolved).toMatchObject({
    status: 'SUCCEEDED',
    kind: 'CREATE',
    register: created.register,
  });
  expect(
    (await actor.expect(`/cash-registers/${id}?locationId=${body.locationId}`)).register,
  ).toEqual(archived.register);
  expect(
    (await actor.call('/cash-registers', 'POST', { ...body, requestKey: randomUUID() })).status,
  ).toBe(409);
  expect(
    (
      await actor.call(`/cash-registers/${id}/archive`, 'POST', {
        ...archive,
        version: 3,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await actor.call(`/cash-registers/${id}`, 'PATCH', {
        ...rename,
        version: 3,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  expect((await actor.call('/cash-registers', 'POST', { ...body, name: 'Alt hash' })).status).toBe(
    409,
  );
  expect((await f.actors.second!.session.call('/cash-registers', 'POST', body)).status).toBe(409);
  expect(
    (
      await f.actors.second!.session.call('/cash-register-commands/resolution', 'POST', {
        locationId: body.locationId,
        requestKey: body.requestKey,
        kind: 'CREATE',
      })
    ).status,
  ).toBe(409);
  const list = await actor.expect(`/cash-registers?locationId=${body.locationId}&status=ARCHIVED`);
  expect(list.registers.filter((row: { id: string }) => row.id === id)).toEqual([
    archived.register,
  ]);
}

export async function verifyRegisterResolution(f: CashRegistersFixture) {
  const actor = f.actors.manager!.session;
  const body = f.body();
  const pointer = { locationId: body.locationId, requestKey: body.requestKey, kind: 'CREATE' };
  const retired = await actor.expect('/cash-register-commands/resolution', 'POST', pointer);
  expect(retired).toMatchObject({ ...pointer, status: 'RETIRED', registerId: null });
  expect(await actor.expect('/cash-register-commands/resolution', 'POST', pointer)).toEqual(
    retired,
  );
  expect((await actor.call('/cash-registers', 'POST', body)).status).toBe(409);
  const created = (
    await actor.expect('/cash-registers', 'POST', { ...body, requestKey: randomUUID() })
  ).register;
  const target = (await actor.expect('/cash-registers', 'POST', f.body())).register;
  const rename = {
    locationId: body.locationId,
    requestKey: randomUUID(),
    version: 1,
    name: 'Nu se aplică',
  };
  const renamePointer = {
    locationId: body.locationId,
    requestKey: rename.requestKey,
    kind: 'RENAME',
    registerId: created.id,
  };
  expect(
    await actor.expect('/cash-register-commands/resolution', 'POST', renamePointer),
  ).toMatchObject({ ...renamePointer, status: 'RETIRED' });
  expect((await actor.call(`/cash-registers/${created.id}`, 'PATCH', rename)).status).toBe(409);
  expect(
    (
      await actor.call('/cash-register-commands/resolution', 'POST', {
        ...renamePointer,
        registerId: target.id,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await actor.call('/cash-register-commands/resolution', 'POST', {
        ...renamePointer,
        kind: 'ARCHIVE',
      })
    ).status,
  ).toBe(409);
  expect(
    (await actor.expect(`/cash-registers/${created.id}?locationId=${body.locationId}`)).register,
  ).toEqual(created);
}
