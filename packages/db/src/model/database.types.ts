import type { Prisma } from '@prisma/client';

export type TenantTransaction = Prisma.TransactionClient;
export interface ValidatedTenantContext {
  organizationId: string;
  userId?: string;
}
export interface DatabaseRolePrivileges {
  rolsuper: boolean;
  rolbypassrls: boolean;
  owns: boolean;
  canCreate: boolean;
  rolname: string;
}

export interface TenantTransactionOptions {
  readOnlySnapshot?: boolean;
}
