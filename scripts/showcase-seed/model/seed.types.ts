import type { PrismaClient } from '../../../packages/db/src/index';
import type { Order, CustomerDto, PackingSessionDto } from '../../../packages/contracts/src/index';
import type { SeedHttpClient } from './http-client';

export interface SeedTarget {
  hostname: string;
  port: string;
  database: string;
  origin: string;
  mode: 'local' | 'production';
}
export interface SeedRecord {
  version: 1;
  id: string;
  target: SeedTarget;
  expiresAt: string;
  platform: { id: string; login: string; password: string };
  companies: Array<{ slug: string; name: string; admin: { login: string; password: string } }>;
  users: Array<{ id: string; login: string; secret: string; profile: number; location: number }>;
}
export interface SeedClients {
  runtime: PrismaClient;
  platform: PrismaClient;
  auth: PrismaClient;
}
export interface SeedIdentity {
  organization: { id: string; slug: string; status: string };
  user: {
    id: string;
    loginNormalized: string;
    status: string;
    isPrimaryAdmin: boolean;
    createdByPlatformAdminId: string;
  };
}
export interface SeedReferences {
  organizationId: string;
  adminId: string;
  locationIds: string[];
  registerIds: string[];
  products: Array<{ id: string; sku: string }>;
  inventory: Array<{ id: string; unit: string }>;
}
export interface SeedLocationContext {
  record: SeedRecord;
  references: SeedReferences;
  locationIndex: number;
  operator: SeedHttpClient;
  cashier: SeedHttpClient;
  cook: SeedHttpClient;
  stock: SeedHttpClient;
  courier: SeedHttpClient;
  shiftId: string;
  customers: CustomerDto[];
}
export interface OrderResult {
  order: Order;
}
export interface PackingResult {
  session: PackingSessionDto;
}
