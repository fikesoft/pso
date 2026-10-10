import type { Prisma } from '@pos/db';
export type StoredCashRegister = Prisma.CashRegisterGetPayload<Record<string, never>>;
export type StoredRegisterCommand = Prisma.CashRegisterCommandGetPayload<Record<string, never>>;
