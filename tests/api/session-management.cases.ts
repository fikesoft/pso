import { expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BrowserSession, db, noSecrets } from './support/harness';
import type { FoundationScenario } from './foundation.types';

export async function verifySessionManagement(f: FoundationScenario) {
  const { ana, primary, primaryB, companyA, locA, locB, suffix } = f;
  const own = await ana.expect('/sessions');
  expect(own.sessions).toHaveLength(1);
  expect(own.sessions[0]).toMatchObject({ current: true, authenticationMethod: 'PASSWORD' });
  noSecrets(own);
  expect(Object.keys(own.sessions[0]).sort()).toEqual([
    'authenticationMethod',
    'createdAt',
    'current',
    'expiresAt',
    'id',
    'idleExpiresAt',
    'lastSeenAt',
  ]);

  const pin = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const created = await ana.expect('/staff', 'POST', {
    login: `sessions-${suffix}`,
    displayName: 'Lucrător sesiuni sintetic',
    authenticationMethod: 'PIN',
    pin,
    locationIds: [locA.id],
  });
  const workerSessions = await Promise.all(
    Array.from({ length: 4 }, async () => {
      const session = new BrowserSession('TENANT');
      await session.expect('/auth/session');
      const ready = await session.expect('/auth/pin', 'POST', {
        companySlug: companyA.organization.slug,
        pin,
      });
      expect(ready.stage).toBe('ready');
      return session;
    }),
  );
  const workerId = created.user.id as string;
  const expiredId = (await workerSessions[3]!.expect('/sessions')).sessions.find(
    (session: { current: boolean }) => session.current,
  ).id;
  await db.withTenantTransaction(
    db.runtime,
    { organizationId: companyA.organization.id, userId: workerId },
    (tx) =>
      tx.tenantSession.update({
        where: { id: expiredId },
        data: {
          expiresAt: new Date(Date.now() - 1000),
          idleExpiresAt: new Date(Date.now() - 1000),
        },
      }),
  );
  const firstPage = await ana.expect(`/sessions?userId=${workerId}&limit=2`);
  expect(firstPage.sessions).toHaveLength(2);
  expect(firstPage.nextCursor).toBeTruthy();
  expect(firstPage.sessions.every((session: { current: boolean }) => !session.current)).toBe(true);
  const secondPage = await ana.expect(
    `/sessions?userId=${workerId}&limit=2&cursor=${firstPage.nextCursor}`,
  );
  expect(secondPage.sessions).toHaveLength(1);
  expect(secondPage.nextCursor).toBeNull();
  expect((await ana.call(`/sessions?userId=${workerId}&limit=51`)).status).toBe(400);
  expect((await ana.call(`/sessions/${expiredId}`, 'DELETE')).status).toBe(404);
  noSecrets([firstPage, secondPage]);
  expect((await workerSessions[0]!.expect('/sessions')).sessions).toHaveLength(3);

  const cross = (await primaryB.expect('/sessions')).sessions[0].id;
  expect((await ana.call(`/sessions?userId=${f.companyA.organization.id}`)).status).toBe(404);
  expect((await ana.call(`/sessions/${cross}`, 'DELETE')).status).toBe(404);
  expect((await primaryB.expect('/sessions')).sessions[0].id).toBe(cross);
  const wrongCursor = await ana.call(`/sessions?userId=${workerId}&cursor=${cross}`);
  expect(wrongCursor.status).toBe(400);

  const multi = await primary.expect('/staff', 'POST', {
    login: `sessions-multi-${suffix}`,
    displayName: 'Lucrător două locații',
    managedByUserId: (await ana.expect('/auth/session')).user.id,
    authenticationMethod: 'PIN',
    pin: randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase(),
    locationIds: [locA.id, locB.id],
  });
  expect((await ana.call(`/sessions?userId=${multi.user.id}`)).status).toBe(403);
  expect((await ana.call('/sessions/revoke-all', 'POST', { userId: multi.user.id })).status).toBe(
    403,
  );

  const victimId = (await workerSessions[0]!.expect('/sessions')).sessions.find(
    (session: { current: boolean }) => session.current,
  ).id;
  const single = await ana.expect(`/sessions/${victimId}`, 'DELETE');
  expect(single).toMatchObject({ revoked: 1, currentRevoked: false });
  expect((await workerSessions[0]!.call('/context')).status).toBe(401);
  expect((await workerSessions[1]!.expect('/context')).organization.id).toBe(
    companyA.organization.id,
  );
  const all = await ana.expect('/sessions/revoke-all', 'POST', { userId: workerId });
  expect(all).toMatchObject({ revoked: 2, currentRevoked: false });
  expect((await workerSessions[1]!.call('/context')).status).toBe(401);
  expect((await workerSessions[2]!.call('/context')).status).toBe(401);
  expect((await ana.expect(`/sessions?userId=${workerId}`)).sessions).toHaveLength(0);
  const audit = await db.withTenantTransaction(
    db.runtime,
    {
      organizationId: companyA.organization.id,
      userId: (await ana.expect('/auth/session')).user.id,
    },
    (tx) => tx.auditEvent.findMany({ where: { targetId: workerId } }),
  );
  expect(audit.map((event) => event.action)).toEqual(
    expect.arrayContaining(['session.all.revoked']),
  );

  const preMfa = new BrowserSession('TENANT');
  await preMfa.login(`ana-${suffix}`, f.activatedAna.permanent, companyA.organization.slug);
  expect((await preMfa.call('/sessions')).status).toBe(403);
  expect((await preMfa.call('/sessions/revoke-all', 'POST', {})).status).toBe(403);
  const self = await ana.expect(`/sessions/${own.sessions[0].id}`, 'DELETE');
  expect(self.currentRevoked).toBe(true);
  expect((await ana.call('/context')).status).toBe(401);
}
