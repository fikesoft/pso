import type { Prisma } from '@pos/db';

export type StaffUser = Prisma.CompanyUserGetPayload<Record<string, never>>;
