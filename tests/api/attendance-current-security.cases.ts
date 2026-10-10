import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { prepareFoundationScenario } from './foundation-setup';
import { activate, BrowserSession } from './support/harness';
import type { AwaitedReturn } from './brands-locations.types';

export async function verifyAttendanceCurrentScope(
  fixture: AwaitedReturn<typeof prepareFoundationScenario>,
) {
  const { primary, locA, locB, companyA, suffix } = fixture;
  const role = (
    await primary.expect('/roles', 'POST', {
      name: `Pontaj două locații ${suffix}`,
      permissions: [{ permission: 'attendance.clock' }],
    })
  ).role;
  const login = `pontaj-ab-${suffix}`;
  const created = await primary.expect('/staff', 'POST', {
    login,
    displayName: 'Lucrător în două locații',
    locationIds: [locA.id, locB.id],
    assignments: [locA.id, locB.id].map((locationId) => ({
      roleVersionId: role.versions[0].id,
      scopeType: 'LOCATION',
      locationId,
    })),
  });
  const worker = new BrowserSession('TENANT');
  const { permanent } = await activate(
    worker,
    login,
    created.temporaryPassword,
    companyA.organization.slug,
  );
  const active = (
    await worker.expect('/attendance/start', 'POST', {
      locationId: locB.id,
      requestKey: randomUUID(),
    })
  ).shift;
  expect((await worker.expect(`/attendance/current?locationId=${locA.id}`)).shift.id).toBe(
    active.id,
  );
  for (const permission of ['attendance.clock', 'attendance.read']) {
    await primary.expect(`/staff/${created.user.id}/overrides`, 'POST', {
      permission,
      effect: 'DENY',
      scopeType: 'LOCATION',
      locationId: locB.id,
    });
  }
  await worker.login(login, permanent, companyA.organization.slug);
  const currentA = await worker.expect(`/attendance/current?locationId=${locA.id}`);
  expect(currentA.shift).toBeNull();
  expect(JSON.stringify(currentA)).not.toContain(active.id);
  expect(JSON.stringify(currentA)).not.toContain(active.startedAt);
  expect((await worker.call(`/attendance/shifts?locationId=${locB.id}`)).status).toBe(403);
  const restart = await worker.call('/attendance/start', 'POST', {
    locationId: locA.id,
    requestKey: randomUUID(),
  });
  expect(restart.status).toBe(409);
  expect(restart.data.code).toBe('ACTIVE_SHIFT_ELSEWHERE');
  expect(JSON.stringify(restart.data)).not.toContain(active.id);
}
