import type { Prisma } from '@pos/db';

export type StoredModifierGroup = Prisma.ModifierGroupGetPayload<Record<string, never>>;
export type StoredModifierOption = Prisma.ModifierOptionGetPayload<Record<string, never>>;
export type StoredProductModifierGroup = Prisma.ProductModifierGroupGetPayload<
  Record<string, never>
>;
