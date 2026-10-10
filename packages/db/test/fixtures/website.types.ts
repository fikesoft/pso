import type { Prisma } from '../../src/index';
import type { createWebsiteFixture } from './website.fixture';

export type WebsiteFixture = Awaited<ReturnType<typeof createWebsiteFixture>>;
export type WebsiteInboundOptions = {
  header?: Partial<Prisma.WebsiteOrderCreateInput>;
  item?: Partial<Prisma.WebsiteOrderItemCreateInput>;
  omitItems?: boolean;
};
export type WebsiteLookupRow = {
  result: null | {
    keyId: string;
    organizationId: string;
    locationId: string;
    connectionId: string;
    createdByUserId: string;
    expiresAt: string;
  };
};
export type WebsiteLookupPrivileges = {
  owner: string;
  ownerCanLogin: boolean;
  securityDefiner: boolean;
  settings: string[];
  authExecute: boolean;
  runtimeExecute: boolean;
  platformExecute: boolean;
  internalCreate: boolean;
};
