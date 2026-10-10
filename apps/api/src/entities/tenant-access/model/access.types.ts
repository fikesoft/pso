import type { Prisma, TenantTransaction } from '@pos/db';
import type { Request, Response } from 'express';
import type { TenantAuthState } from '../../../shared/lib/http';
import type { loadAccess } from './load-access';
export type AccessData = Awaited<ReturnType<typeof loadAccess>>;
export type TenantHandler = (
  tx: TenantTransaction,
  access: AccessData,
  auth: TenantAuthState,
  req: Request,
  res: Response,
) => Promise<unknown>;

export type PermissionRow = {
  permissionKey: string;
  maxAmount?: Prisma.Decimal | string | null;
  maxPercent?: Prisma.Decimal | string | null;
};
export type ScopeRow = {
  organizationId: string;
  scopeType: string;
  locationId: string | null;
  issuedByUserId: string;
};
export interface ScopeInput {
  scopeType?: string;
  locationId?: string | null;
}

export interface EndpointOptions {
  readOnly?: boolean;
  readOnlySnapshot?: boolean;
}
