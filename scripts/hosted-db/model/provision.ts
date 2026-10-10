import type { PrismaClient } from '../../../packages/db/src/index';
import { hostedRoles } from '../config/roles.constants';

export async function provisionHostedRoles(
  admin: PrismaClient,
  passwords: Readonly<Record<string, string>>,
) {
  const tables = await admin.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public') AS exists`;
  const roles = await admin.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('pos_migrator','pos_runtime','pos_auth','pos_platform','pos_worker','pos_internal')) AS exists`;
  if (tables[0]?.exists || roles[0]?.exists)
    throw new Error(
      'Folosiți un proiect Neon nou și o bază goală; instalările existente nu se reprovisionează.',
    );
  await admin.$transaction(
    async (tx) => {
      for (const [role] of hostedRoles) {
        await tx.$executeRawUnsafe(
          `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`,
        );
        await tx.$queryRaw`SELECT set_config('pos.provision_password', ${passwords[role]}, true)`;
        await tx.$executeRawUnsafe(
          `DO $password$ BEGIN EXECUTE format('ALTER ROLE ${role} PASSWORD %L',current_setting('pos.provision_password')); END $password$`,
        );
      }
      await tx.$executeRawUnsafe(
        'CREATE ROLE pos_internal NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT',
      );
      await tx.$executeRawUnsafe('GRANT pos_internal TO pos_migrator');
      await tx.$executeRawUnsafe(`DO $owner$ BEGIN
      EXECUTE format('GRANT pos_migrator TO %I',current_user);
      EXECUTE format('ALTER DATABASE %I OWNER TO pos_migrator',current_database());
    END $owner$`);
      await tx.$executeRawUnsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await tx.$executeRawUnsafe('ALTER SCHEMA public OWNER TO pos_migrator');
      await tx.$executeRawUnsafe('GRANT USAGE, CREATE ON SCHEMA public TO pos_migrator');
    },
    { timeout: 30_000 },
  );
}
