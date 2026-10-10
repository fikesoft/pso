import type { Prisma } from '@prisma/client';

export interface TenantCacheAddress {
  namespace: string;
  key: string;
}

export interface TenantCacheWrite extends TenantCacheAddress {
  value: Prisma.InputJsonObject;
  ttlSeconds: number;
}

export interface TenantCacheRow {
  value: Prisma.JsonObject;
}
