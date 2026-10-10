import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '../../packages/db/src';
import { activate, BrowserSession, db, fixturePasswords, passwordHash } from './support/harness';
import type { MfaRaceFixture, MfaRaceTarget } from './mfa-race.types';

export async function prepareMfaTarget(
  f: MfaRaceFixture,
  kind: MfaRaceTarget['kind'],
): Promise<MfaRaceTarget> {
  const login = `mfa-race-${randomUUID()}`;
  const session = new BrowserSession(kind);
  let userId: string;
  let password: string;
  if (kind === 'TENANT') {
    const role = (
      await f.a.primary.expect('/roles', 'POST', {
        name: login,
        permissions: [{ permission: 'staff.create' }],
      })
    ).role;
    const created = await f.a.primary.expect('/staff', 'POST', {
      login,
      displayName: 'MFA cursă sintetică',
      locationIds: [f.a.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
      ],
    });
    userId = created.user.id;
    password = (
      await activate(session, login, created.temporaryPassword, f.a.company.organization.slug)
    ).permanent;
  } else {
    password = `Mfa-race-${randomUUID()}`;
    fixturePasswords.add(password);
    const user = await db.platformDb.platformAdmin.create({
      data: {
        loginNormalized: login,
        displayName: 'MFA platformă sintetică',
        passwordHash: await passwordHash(password),
      },
    });
    userId = user.id;
    await session.login(login, password);
  }
  const result = await session.expect('/auth/mfa/enroll', 'POST', {});
  fixturePasswords.add(result.secret);
  const organizationId = kind === 'TENANT' ? (f.a.company.organization.id as string) : undefined;
  const credential =
    kind === 'TENANT'
      ? await db.withTenantTransaction(db.runtime, { organizationId: organizationId! }, (tx) =>
          tx.mfaCredential.findFirstOrThrow({ where: { userId } }),
        )
      : await db.platformDb.mfaCredential.findFirstOrThrow({ where: { platformAdminId: userId } });
  return {
    kind,
    userId,
    organizationId,
    session,
    credentialId: credential.id,
    secret: result.secret,
    password,
  };
}

export async function withCredentialLock(
  target: MfaRaceTarget,
  run: (tx: TenantTransaction, pid: number) => Promise<void>,
) {
  const handler = async (tx: TenantTransaction) => {
    const rows = await tx.$queryRaw<
      { pid: number }[]
    >`SELECT pg_backend_pid() AS pid FROM "MfaCredential" WHERE id=${target.credentialId}::uuid FOR UPDATE`;
    await run(tx, rows[0]!.pid);
  };
  if (target.kind === 'TENANT')
    await db.withTenantTransaction(db.runtime, { organizationId: target.organizationId! }, handler);
  else await db.platformDb.$transaction(handler);
}

export async function waitForBlockedMfa(
  target: MfaRaceTarget,
  pid: number,
  table = 'MfaCredential',
) {
  const client = target.kind === 'TENANT' ? db.runtime : db.platformDb;
  for (let attempt = 0; attempt < 150; attempt++) {
    const rows = await client.$queryRaw<{ waiting: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_stat_activity
        WHERE wait_event_type='Lock' AND ${pid}::int=ANY(pg_blocking_pids(pid))
          AND query LIKE ${`%${table}%`}) AS waiting`;
    if (rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Cererea MFA nu a ajuns la blocarea controlată');
}

export async function readMfaCredential(target: MfaRaceTarget) {
  return target.kind === 'TENANT'
    ? db.withTenantTransaction(db.runtime, { organizationId: target.organizationId! }, (tx) =>
        tx.mfaCredential.findUniqueOrThrow({ where: { id: target.credentialId } }),
      )
    : db.platformDb.mfaCredential.findUniqueOrThrow({ where: { id: target.credentialId } });
}
