import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../../apps/api/src/entities/session';
import type { SeedClients, SeedIdentity, SeedRecord } from './seed.types';

export async function readIdentity(clients: SeedClients, record: SeedRecord, index: number) {
  const company = record.companies[index]!;
  const rows = await clients.auth.$queryRaw<Array<{ data: SeedIdentity | null }>>`
    SELECT pos_auth.lookup_tenant_login(${company.slug},${company.admin.login}) AS data`;
  return rows[0]?.data ?? null;
}
export function assertIdentity(identity: SeedIdentity, record: SeedRecord, index: number) {
  const company = record.companies[index]!;
  if (
    identity.organization.slug !== company.slug ||
    identity.organization.status !== 'ACTIVE' ||
    identity.user.loginNormalized !== company.admin.login ||
    !identity.user.isPrimaryAdmin ||
    identity.user.status !== 'ACTIVE' ||
    identity.user.createdByPlatformAdminId !== record.platform.id
  )
    throw new Error('Compania existentă nu aparține acestui seed. Nu o modific.');
}
export async function provisionCompanies(clients: SeedClients, record: SeedRecord) {
  const ownerHash = await hashPassword(record.platform.password);
  const adminHashes = await Promise.all(
    record.companies.map((c) => hashPassword(c.admin.password)),
  );
  await clients.platform.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'showcase-seed'},0))`;
      const owner = await tx.platformAdmin.findUnique({
        where: { loginNormalized: record.platform.login },
      });
      if (owner && (owner.id !== record.platform.id || owner.status !== 'ACTIVE'))
        throw new Error('Contul platformei nu corespunde manifestului. Nu îi schimb parola.');
      if (!owner)
        await tx.platformAdmin.create({
          data: {
            id: record.platform.id,
            loginNormalized: record.platform.login,
            displayName: 'Proprietar DEMO sintetic',
            passwordHash: ownerHash,
            mustChangePassword: true,
            mfaRequired: true,
          },
        });
      const organizations = await tx.$queryRaw<
        Array<{ data: { slug: string } }>
      >`SELECT pos_control.list_organizations() AS data`;
      for (const [index, company] of record.companies.entries()) {
        const found = organizations.some((row) => row.data.slug === company.slug);
        if (found) {
          const identity = await readIdentity(clients, record, index);
          if (!identity) throw new Error('Companie existentă incompatibilă; provisioning refuzat.');
          assertIdentity(identity, record, index);
          continue;
        }
        if (new Date(record.expiresAt).getTime() <= Date.now())
          throw new Error('Parolele temporare din manifest au expirat. Nu le regenerez automat.');
        await tx.$queryRaw`SELECT pos_control.provision_organization(
        ${company.slug},${company.name},${'Companie sintetică pentru demonstrație POS'},
        ${company.admin.login},${'Administrator principal DEMO'},${adminHashes[index]},
        ${new Date(record.expiresAt)},${record.platform.id}::uuid) AS data`;
      }
      if (!owner)
        await tx.auditEvent.create({
          data: {
            actorPlatformAdminId: record.platform.id,
            action: 'showcase.platform.bootstrap',
            targetType: 'PLATFORM_ADMIN',
            targetId: record.platform.id,
            outcome: 'SUCCESS',
            requestId: randomUUID(),
          },
        });
    },
    { timeout: 30_000 },
  );
  const identities = await Promise.all(
    record.companies.map((_, i) => readIdentity(clients, record, i)),
  );
  return identities.map((identity, i) => {
    if (!identity) throw new Error('Provisioning neconfirmat.');
    assertIdentity(identity, record, i);
    return identity;
  });
}
