import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { db, fixturePasswords, passwordHash } from './support/harness';
import { prepareMfaTarget, waitForBlockedMfa } from './mfa-race-support';
import type { MfaRaceFixture } from './mfa-race.types';

export async function verifyPlatformPasswordRace(
  f: MfaRaceFixture,
  change: 'password' | 'session',
) {
  const target = await prepareMfaTarget(f, 'PLATFORM');
  const replacement = `Replacement-${randomUUID()}`;
  const requested = `Requested-${randomUUID()}`;
  fixturePasswords.add(replacement);
  fixturePasswords.add(requested);
  const replacementHash = await passwordHash(replacement);
  const before = await db.platformDb.platformAdmin.findUniqueOrThrow({
    where: { id: target.userId },
  });
  let response: ReturnType<typeof target.session.call> | undefined;
  await db.platformDb.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { pid: number }[]
    >`SELECT pg_backend_pid() AS pid FROM "PlatformAdmin" WHERE id=${target.userId}::uuid FOR UPDATE`;
    response = target.session.call('/auth/password', 'POST', {
      currentPassword: target.password,
      newPassword: requested,
    });
    await waitForBlockedMfa(target, rows[0]!.pid, 'PlatformAdmin');
    if (change === 'password')
      await tx.platformAdmin.update({
        where: { id: target.userId },
        data: { passwordHash: replacementHash, authVersion: { increment: 1 } },
      });
    await tx.platformSession.updateMany({
      where: { platformAdminId: target.userId },
      data: { revokedAt: new Date() },
    });
  });
  expect((await response!).status).toBe(401);
  const after = await db.platformDb.platformAdmin.findUniqueOrThrow({
    where: { id: target.userId },
  });
  expect(after.passwordHash).toBe(change === 'password' ? replacementHash : before.passwordHash);
  expect(after.authVersion).toBe(before.authVersion + (change === 'password' ? 1 : 0));
  expect((await target.session.expect('/auth/session')).user).toBeNull();
}
