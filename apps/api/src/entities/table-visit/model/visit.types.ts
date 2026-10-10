import type { Prisma } from '@pos/db';
export type StoredVisit = Prisma.TableVisitGetPayload<Record<string, never>>;
export type StoredVisitEvent = Prisma.TableVisitEventGetPayload<Record<string, never>>;
