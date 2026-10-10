import { randomUUID } from 'node:crypto';
import { chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { DemoAccounts } from '../apps/api/src/app/model/demo.types';
import { config } from '../apps/api/src/config';
import { bootstrapDb, runtime, withTenantTransaction } from '../apps/api/src/db';
import type { TenantLoginLookup } from '../apps/api/src/entities/session';
import { generateStaffPin, staffPinLookup, verifyPassword } from '../apps/api/src/entities/session';
import { configureStaffPin } from '../apps/api/src/features/staff/model/staff-pin';

const path = '.local/dev-accounts.json';
const pendingPath = '.local/dev-accounts.pin-pending.json';
const database = new URL(config.DATABASE_URL!);
if (
  config.NODE_ENV === 'production' ||
  !['127.0.0.1', 'localhost'].includes(database.hostname) ||
  database.pathname !== '/pos_dev'
)
  throw new Error('Conversia conturilor demo este permisă doar în baza locală pos_dev.');
const accounts: DemoAccounts = JSON.parse(readFileSync(path, 'utf8'));
let converted = 0;
try {
  for (const company of accounts.companies) {
    if (!['sakura-demo', 'bistro-demo'].includes(company.slug)) continue;
    const index = company.users.findIndex((user) => user.login === 'chelner');
    const credential = company.users[index];
    if (!credential) continue;
    const rows = await bootstrapDb.$queryRaw<TenantLoginLookup[]>`
      SELECT pos_auth.lookup_tenant_login(${company.slug},${credential.login}) AS data`;
    const found = rows[0]?.data;
    if (!found?.user.organizationId) throw new Error(`Cont demo indisponibil: ${company.slug}`);
    if (found.user.authenticationMethod === 'PIN') {
      if (
        !credential.pin ||
        found.user.pinLookup !== staffPinLookup(company.slug, credential.pin) ||
        !(await verifyPassword(found.user.pinHash!, credential.pin))
      )
        throw new Error(
          'PIN-ul existent nu corespunde fișierului privat. Verificați copia pin-pending; nu rotesc automat codul.',
        );
      continue;
    }
    const pin = generateStaffPin();
    company.users[index] = {
      login: credential.login,
      location: credential.location,
      authenticationMethod: 'PIN',
      pin,
    };
    // Preserve the issued code locally before the database commit for crash recovery.
    writeFileSync(pendingPath, JSON.stringify(accounts, null, 2), { mode: 0o600 });
    chmodSync(pendingPath, 0o600);
    await withTenantTransaction(
      runtime,
      { organizationId: found.user.organizationId, userId: found.user.id },
      async (tx) => {
        const organizationId = found.user.organizationId!;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId},0))`;
        const current = await tx.companyUser.findUniqueOrThrow({ where: { id: found.user.id } });
        if (current.authenticationMethod !== 'PASSWORD' || current.status !== 'ACTIVE')
          throw new Error('Contul demo s-a schimbat; conversia a fost anulată.');
        await configureStaffPin(tx, organizationId, current.id, pin);
        await tx.auditEvent.create({
          data: {
            organizationId,
            action: 'staff.pin.demo.enabled',
            targetType: 'USER',
            targetId: current.id,
            outcome: 'SUCCESS',
            requestId: randomUUID(),
            metadata: { source: 'local-demo-migration' },
          },
        });
      },
    );
    renameSync(pendingPath, path);
    converted++;
  }
  console.log(
    `${converted} conturi demo convertite la PIN. Codurile rămân în fișierul privat ${path}.`,
  );
} finally {
  await Promise.all([runtime.$disconnect(), bootstrapDb.$disconnect()]);
}
