import { assertRuntimeDatabaseRole } from '@pos/db';
import { createDemoAccounts } from './app/model/demo-bootstrap';
import {
  readDemoAccounts,
  findDemoCompany,
  ensureEmptyDemoCompany,
} from './app/model/demo-accounts';
import { seedDemoCatalog } from './app/model/demo-catalog';
import { DEMO_OWNER_LOGIN, DEMO_POPULATED_SLUGS } from './app/config/demo.constants';
import { config } from './shared/config';
import { bootstrapDb, platformDb, runtime, withTenantTransaction } from './shared/db';

// Never seed a remote database, even with an accidentally permissive NODE_ENV.
if (config.NODE_ENV === 'production') throw new Error('Seedul este interzis în producție.');
for (const value of [config.DATABASE_URL, config.AUTH_DATABASE_URL, config.PLATFORM_DATABASE_URL]) {
  const url = new URL(value!);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/pos_dev')
    throw new Error('Seedul este permis numai în baza locală pos_dev.');
}
try {
  await assertRuntimeDatabaseRole(runtime);
  const accounts = readDemoAccounts() ?? (await createDemoAccounts());
  if (accounts.platform.login !== DEMO_OWNER_LOGIN)
    throw new Error('Fișierul nu aparține seedului demo.');
  const owner = await platformDb.platformAdmin.findUniqueOrThrow({
    where: { loginNormalized: DEMO_OWNER_LOGIN },
  });
  for (const slug of DEMO_POPULATED_SLUGS) {
    const company = accounts.companies.find((entry) => entry.slug === slug);
    if (!company) throw new Error(`Compania ${slug} lipsește din fișierul local.`);
    const { user, organization } = await findDemoCompany(slug, company.admin.login);
    const result = await withTenantTransaction(
      runtime,
      { organizationId: organization.id, userId: user.id },
      (tx) => seedDemoCatalog(tx, organization.id, user.id),
    );
    console.log(`${slug}: ${result.created} produse adăugate; ${result.locations} locații active.`);
  }
  await ensureEmptyDemoCompany(accounts, owner.id);
  console.log(
    'Atelier DEMO este disponibil pentru configurare. Credențiale: .local/dev-accounts.json. Conturile și modificările existente sunt păstrate.',
  );
} finally {
  await Promise.all([runtime.$disconnect(), platformDb.$disconnect(), bootstrapDb.$disconnect()]);
}
