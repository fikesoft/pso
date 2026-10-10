import type { Prisma } from '@pos/db';
export interface UpsellCandidate {
  rule: Prisma.UpsellRuleGetPayload<Record<string, never>>;
  product: Prisma.ProductGetPayload<Record<string, never>>;
  local: Prisma.LocationProductGetPayload<Record<string, never>>;
}
