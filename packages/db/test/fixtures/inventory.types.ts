import type { Prisma } from '../../src/index';
import type { createInventoryFixture } from './inventory.fixture';

export type InventoryFixture = Awaited<ReturnType<typeof createInventoryFixture>>;
export type InventoryFixtureItem = Prisma.InventoryItemGetPayload<Record<string, never>>;
export type InventoryFixtureLine = {
  inventoryItemId: string;
  purpose: string;
  quantityPerUnit: string;
  serviceTypes: string[];
};
export type InventorySendOptions = {
  quantity?: string;
  serviceType?: string;
  omitMovements?: boolean;
  movement?: Partial<Prisma.InventoryReservationLineUncheckedCreateInput>;
};
