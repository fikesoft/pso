import type { Prisma } from '@pos/db';
export type StoredKitchenStation = Prisma.KitchenStationGetPayload<Record<string, never>>;
export type StoredStationCommand = Prisma.KitchenStationCommandGetPayload<Record<string, never>>;
