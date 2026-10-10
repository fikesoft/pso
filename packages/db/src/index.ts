import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DATABASE_OPTIONS, UUID_PATTERN } from './config/database.constants';
import type {
  DatabaseRolePrivileges,
  TenantTransaction,
  ValidatedTenantContext,
  TenantTransactionOptions,
} from './model/database.types';
export { Prisma, PrismaClient };
export * from './cache';
export { listenForDatabaseNotifications } from './notifications';
export type {
  TenantTransaction,
  ValidatedTenantContext,
  TenantTransactionOptions,
} from './model/database.types';
/** Pass only server-validated identity context; raw request tenant IDs are not authentication. */
export function createDatabaseClient(
  connectionString: string,
  max: number = process.env.VERCEL === '1'
    ? DATABASE_OPTIONS.vercelMaxConnections
    : DATABASE_OPTIONS.maxConnections,
): PrismaClient {
  if (!connectionString) throw new Error('Conexiunea PostgreSQL lipsește.');
  // PrismaPg serializes Date values without offsets: require UTC on every connection.
  // IANA business timezones remain explicit organization/location configuration.
  const adapter = new PrismaPg({
    connectionString,
    options: '-c timezone=UTC',
    max,
    idleTimeoutMillis: DATABASE_OPTIONS.idleTimeoutMillis,
    connectionTimeoutMillis: DATABASE_OPTIONS.connectionTimeoutMillis,
  });
  return new PrismaClient({ adapter });
}
/** Context is LOCAL to one transaction, including rollback, and never persists on pooled connections. */
export async function withTenantTransaction<T>(
  client: PrismaClient,
  context: ValidatedTenantContext,
  fn: (tx: TenantTransaction) => Promise<T>,
  options: TenantTransactionOptions = {},
): Promise<T> {
  if (
    !UUID_PATTERN.test(context.organizationId) ||
    (context.userId !== undefined && !UUID_PATTERN.test(context.userId))
  ) {
    throw new Error('Contextul tenantului nu este valid.');
  }
  return client.$transaction(
    async (tx) => {
      if (options.readOnlySnapshot) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$queryRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.user_id', ${context.userId ?? ''}, true)`;
      return fn(tx);
    },
    {
      ...(options.readOnlySnapshot
        ? { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
        : {}),
      maxWait: DATABASE_OPTIONS.transactionMaxWaitMillis,
      timeout: DATABASE_OPTIONS.transactionTimeoutMillis,
    },
  );
}
export async function assertRuntimeDatabaseRole(client: PrismaClient): Promise<void> {
  const rows = await client.$queryRaw<DatabaseRolePrivileges[]>`
    SELECT r.rolname,r.rolsuper,r.rolbypassrls, has_schema_privilege(current_user,'public','CREATE') AS "canCreate",
      EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relowner=r.oid AND n.nspname='public' AND c.relkind IN ('r','p')) AS owns
    FROM pg_roles r WHERE r.rolname=current_user`;
  if (
    rows.length !== 1 ||
    rows[0]?.rolsuper ||
    rows[0]?.rolbypassrls ||
    rows[0]?.owns ||
    rows[0]?.canCreate ||
    rows[0]?.rolname !== DATABASE_OPTIONS.runtimeRole
  ) {
    throw new Error(
      'Runtime DB necesită pos_runtime fără ownership/CREATE, SUPERUSER sau BYPASSRLS.',
    );
  }
}
