import { createDatabaseClient } from '../../packages/db/src';

/** Test fixture only: organization renaming intentionally has no tenant API grant. */
export async function renameCheckoutCompany(organizationId: string) {
  const connection = process.env.MIGRATION_DATABASE_URL;
  if (!connection || process.env.NODE_ENV !== 'test')
    throw new Error('Fixture de test local necesară');
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Fixture-ul permite numai PostgreSQL local');
  url.pathname = '/pos_test';
  const fixtureDb = createDatabaseClient(url.toString(), 1);
  try {
    await fixtureDb.$transaction(async (tx) => {
      // Existing migration-role membership; no ACL, policy or schema changes.
      await tx.$executeRaw`SET LOCAL ROLE pos_internal`;
      const changed = await tx.organization.updateMany({
        where: { id: organizationId, slug: { startsWith: 'operations-' } },
        data: { name: 'Companie redenumită' },
      });
      if (changed.count !== 1) throw new Error('Compania sintetică a fixture-ului nu există');
    });
  } finally {
    await fixtureDb.$disconnect();
  }
}
