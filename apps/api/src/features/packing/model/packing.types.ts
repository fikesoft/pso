import type { Prisma } from '@pos/db';

export type StoredPackingSession = Prisma.PackingSessionGetPayload<Record<string, never>>;
export type StoredPackingCommand = Prisma.PackingCommandGetPayload<Record<string, never>>;
