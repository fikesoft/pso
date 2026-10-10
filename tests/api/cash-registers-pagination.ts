import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CashRegistersFixture } from './cash-registers.types';

export async function verifyRegisterPagination(f: CashRegistersFixture) {
  const actor = f.actors.manager!.session;
  for (const code of ['PAGE_A', 'PAGE_B', 'PAGE_C'])
    await actor.expect('/cash-registers', 'POST', f.body(code));
  const path = `/cash-registers?locationId=${f.a.location.id}&limit=2`;
  const first = await actor.expect(path);
  expect(first.registers).toHaveLength(2);
  expect(first.nextCursor).toBeTruthy();
  const cursor = encodeURIComponent(first.nextCursor);
  expect((await actor.call(`${path}&status=ALL&cursor=${cursor}`)).status).toBe(400);
  expect((await f.actors.second!.session.call(`${path}&cursor=${cursor}`)).status).toBe(400);
  expect(
    (await actor.call(`${path}&cursor=${encodeURIComponent(`${first.nextCursor}x`)}`)).status,
  ).toBe(400);
  expect(
    (await f.a.primary.call(`/cash-registers?locationId=${f.otherLocation.id}&cursor=${cursor}`))
      .status,
  ).toBe(400);
  const row = first.registers[0];
  await actor.expect(`/cash-registers/${row.id}`, 'PATCH', {
    locationId: row.locationId,
    version: row.version,
    requestKey: randomUUID(),
    name: 'Nume schimbat între pagini',
  });
  const ids = first.registers.map((register: { id: string }) => register.id);
  const codes = first.registers.map((register: { code: string }) => register.code);
  let next = first.nextCursor;
  while (next) {
    const page = await actor.expect(`${path}&cursor=${encodeURIComponent(next)}`);
    ids.push(...page.registers.map((register: { id: string }) => register.id));
    codes.push(...page.registers.map((register: { code: string }) => register.code));
    next = page.nextCursor;
  }
  expect(new Set(ids).size).toBe(ids.length);
  expect(codes).toEqual([...codes].sort());
  expect(ids).toEqual(
    (await actor.expect(`/cash-registers?locationId=${f.a.location.id}&limit=100`)).registers.map(
      (register: { id: string }) => register.id,
    ),
  );
}

export async function verifyRegisterHttpRaces(f: CashRegistersFixture) {
  const actor = f.actors.manager!.session;
  const body = f.body();
  const results = await Promise.all([
    actor.call('/cash-registers', 'POST', body),
    actor.call('/cash-registers', 'POST', body),
  ]);
  expect(results.map((result) => result.status)).toEqual([200, 200]);
  expect(results[0]!.data).toEqual(results[1]!.data);
  const register = results[0]!.data.register;
  const updates = await Promise.all(
    ['Primul', 'Al doilea'].map((name) =>
      actor.call(`/cash-registers/${register.id}`, 'PATCH', {
        locationId: body.locationId,
        version: 1,
        name,
        requestKey: randomUUID(),
      }),
    ),
  );
  expect(updates.map((result) => result.status).sort()).toEqual([200, 409]);
  const nextBody = f.body();
  const [write, resolve] = await Promise.all([
    actor.call('/cash-registers', 'POST', nextBody),
    actor.call('/cash-register-commands/resolution', 'POST', {
      locationId: nextBody.locationId,
      requestKey: nextBody.requestKey,
      kind: 'CREATE',
    }),
  ]);
  expect(resolve.status).toBe(200);
  if (resolve.data.status === 'SUCCEEDED') {
    expect(write.status).toBe(200);
    expect(write.data.register).toEqual(resolve.data.register);
  } else {
    expect(resolve.data.status).toBe('RETIRED');
    expect(write.status).toBe(409);
  }
}
