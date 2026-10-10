import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it } from 'vitest';
import { prepareFoundationScenario } from './api/foundation-setup';
import { localDayBoundaries } from '../apps/api/src/entities/attendance';
import { activate, BrowserSession, db } from './api/support/harness';
import { verifyAttendanceCurrentScope } from './api/attendance-current-security.cases';
import type { AwaitedReturn } from './api/brands-locations.types';

let fixture: AwaitedReturn<typeof prepareFoundationScenario>;
beforeAll(async () => {
  fixture = await prepareFoundationScenario();
}, 60_000);

it('PostgreSQL calculează limitele zilelor locale la tranzițiile DST', async () => {
  const context = { organizationId: fixture.companyA.organization.id, userId: fixture.primaryId };
  const spring = await db.withTenantTransaction(db.runtime, context, (tx) =>
    localDayBoundaries(tx, '2026-03-29', '2026-03-29', 'Europe/Chisinau'),
  );
  const autumn = await db.withTenantTransaction(db.runtime, context, (tx) =>
    localDayBoundaries(tx, '2026-10-25', '2026-10-25', 'Europe/Chisinau'),
  );
  expect(spring[1]!.getTime() - spring[0]!.getTime()).toBe(23 * 3_600_000);
  expect(autumn[1]!.getTime() - autumn[0]!.getTime()).toBe(25 * 3_600_000);
});

it('respinge datele în afara intervalului suportat înainte de interogarea PostgreSQL', async () => {
  const { primary, locA, primaryId } = fixture;
  for (const day of ['0000-01-01', '9999-12-31']) {
    expect(
      (await primary.call(`/attendance/report?locationId=${locA.id}&from=${day}&to=${day}`)).status,
    ).toBe(400);
    expect((await primary.call(`/staff/${primaryId}/profile?from=${day}&to=${day}`)).status).toBe(
      400,
    );
  }
  for (const instant of ['0000-01-01T00:00:00Z', '9999-12-31T00:00:00Z']) {
    const query = new URLSearchParams({ locationId: locA.id, from: instant });
    expect((await primary.call(`/attendance/shifts?${query}`)).status).toBe(400);
  }
});

it('pontajul tratează reluarea, concurența, pauzele, raportul și revocarea', async () => {
  const { primary, primaryB, locA, locB, companyA, suffix } = fixture;
  const role = (
    await primary.expect('/roles', 'POST', {
      name: `Pontaj ${suffix}`,
      permissions: [{ permission: 'attendance.clock' }],
    })
  ).role;
  const login = `pontaj-${suffix}`;
  const created = await primary.expect('/staff', 'POST', {
    login,
    displayName: 'Lucrător pontaj',
    locationIds: [locA.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: locA.id },
    ],
  });
  const worker = new BrowserSession('TENANT');
  const { permanent } = await activate(
    worker,
    login,
    created.temporaryPassword,
    companyA.organization.slug,
  );
  expect((await worker.call(`/attendance/current?locationId=${locB.id}`)).status).toBe(403);
  const keys = [randomUUID(), randomUUID()];
  const concurrent = await Promise.all(
    keys.map((requestKey) =>
      worker.call('/attendance/start', 'POST', {
        locationId: locA.id,
        requestKey,
      }),
    ),
  );
  expect(concurrent.map((result) => result.status).sort()).toEqual([200, 409]);
  const winner = concurrent.find((result) => result.status === 200)!;
  const winningKey = keys[concurrent.indexOf(winner)]!;
  const first = winner.data.shift;
  expect(first).toMatchObject({ status: 'ACTIVE', locationId: locA.id, version: 1, breaks: [] });
  expect(
    (
      await worker.expect('/attendance/start', 'POST', {
        locationId: locA.id,
        requestKey: winningKey,
      })
    ).shift.id,
  ).toBe(first.id);
  expect(
    (
      await worker.call(`/attendance/shifts/${first.id}/action`, 'POST', {
        action: 'START_BREAK',
        version: 1,
        requestKey: winningKey,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await worker.call('/attendance/start', 'POST', {
        locationId: locB.id,
        requestKey: winningKey,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await primaryB.call(`/attendance/shifts/${first.id}/action`, 'POST', {
        action: 'END_SHIFT',
        version: 1,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(404);
  const breakKey = randomUUID();
  const onBreak = (
    await worker.expect(`/attendance/shifts/${first.id}/action`, 'POST', {
      action: 'START_BREAK',
      version: 1,
      requestKey: breakKey,
    })
  ).shift;
  expect(onBreak).toMatchObject({ status: 'ON_BREAK', version: 2, breaks: [{ endedAt: null }] });
  expect(
    (
      await worker.expect(`/attendance/shifts/${first.id}/action`, 'POST', {
        action: 'START_BREAK',
        version: 1,
        requestKey: breakKey,
      })
    ).shift.id,
  ).toBe(first.id);
  expect(
    (
      await worker.call(`/attendance/shifts/${first.id}/action`, 'POST', {
        action: 'END_BREAK',
        version: 2,
        requestKey: breakKey,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await worker.call(`/attendance/shifts/${first.id}/action`, 'POST', {
        action: 'END_BREAK',
        version: 1,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  const ended = (
    await worker.expect(`/attendance/shifts/${first.id}/action`, 'POST', {
      action: 'END_SHIFT',
      version: 2,
      requestKey: randomUUID(),
    })
  ).shift;
  expect(ended).toMatchObject({ status: 'ENDED', version: 3 });
  expect(ended.breaks[0].endedAt).toEqual(expect.any(String));
  expect((await worker.expect(`/attendance/current?locationId=${locA.id}`)).shift).toBeNull();
  const second = (
    await worker.expect('/attendance/start', 'POST', {
      locationId: locA.id,
      requestKey: randomUUID(),
    })
  ).shift;
  const secondBreak = (
    await worker.expect(`/attendance/shifts/${second.id}/action`, 'POST', {
      action: 'START_BREAK',
      version: 1,
      requestKey: randomUUID(),
    })
  ).shift;
  const resumed = (
    await worker.expect(`/attendance/shifts/${second.id}/action`, 'POST', {
      action: 'END_BREAK',
      version: secondBreak.version,
      requestKey: randomUUID(),
    })
  ).shift;
  expect(resumed).toMatchObject({ status: 'ACTIVE', version: 3 });
  expect(resumed.breaks[0].endedAt).toEqual(expect.any(String));
  await worker.expect(`/attendance/shifts/${second.id}/action`, 'POST', {
    action: 'END_SHIFT',
    version: resumed.version,
    requestKey: randomUUID(),
  });
  const history = await worker.expect(`/attendance/shifts?locationId=${locA.id}&limit=1`);
  expect(history.shifts).toHaveLength(1);
  expect(history.nextCursor).toEqual(expect.any(String));
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Chisinau' }).format(
    new Date(),
  );
  const report = await primary.expect(
    `/attendance/report?locationId=${locA.id}&from=${today}&to=${today}&userId=${created.user.id}`,
  );
  expect(report).toMatchObject({
    timezone: 'Europe/Chisinau',
    rows: [{ userId: created.user.id, shiftCount: 2 }],
  });
  expect(
    (await primaryB.call(`/attendance/report?locationId=${locA.id}&from=${today}&to=${today}`))
      .status,
  ).toBe(404);
  const primaryShift = (
    await primary.expect('/attendance/start', 'POST', {
      locationId: locA.id,
      requestKey: randomUUID(),
    })
  ).shift;
  const elsewhere = await primary.call('/attendance/start', 'POST', {
    locationId: locB.id,
    requestKey: randomUUID(),
  });
  expect(elsewhere.status).toBe(409);
  expect(elsewhere.data.code).toBe('ACTIVE_SHIFT_ELSEWHERE');
  await primary.expect(`/attendance/shifts/${primaryShift.id}/action`, 'POST', {
    action: 'END_SHIFT',
    version: primaryShift.version,
    requestKey: randomUUID(),
  });
  const third = (
    await worker.expect('/attendance/start', 'POST', {
      locationId: locA.id,
      requestKey: randomUUID(),
    })
  ).shift;
  await primary.expect(`/staff/${created.user.id}/overrides`, 'POST', {
    permission: 'attendance.clock',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: locA.id,
  });
  await worker.login(login, permanent, companyA.organization.slug);
  expect(
    (
      await worker.call(`/attendance/shifts/${third.id}/action`, 'POST', {
        action: 'END_SHIFT',
        version: third.version,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(403);
});

it('current nu dezvăluie tura din B după DENY în B când pontarea în A rămâne permisă', async () => {
  await verifyAttendanceCurrentScope(fixture);
});
