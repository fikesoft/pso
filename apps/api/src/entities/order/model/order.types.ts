import type { Prisma, TenantTransaction } from '@pos/db';
import type { ModifierGroupSnapshotDto, ModifierSelectionInput } from '@pos/contracts';

export type StoredOrder = Awaited<ReturnType<TenantTransaction['order']['findFirstOrThrow']>>;
export type StoredOrderItem = Awaited<
  ReturnType<TenantTransaction['orderItem']['findMany']>
>[number];
export type StoredTicket = Awaited<
  ReturnType<TenantTransaction['kitchenTicket']['findFirstOrThrow']>
>;
export type StoredCheckout = Awaited<ReturnType<TenantTransaction['checkout']['findFirstOrThrow']>>;
export interface OrderItemInput {
  id?: string;
  productId: string;
  courseNumber?: number;
  quantity: string;
  note?: string;
  modifiers?: ModifierSelectionInput[];
  sourceUpsellOfferId?: string;
}
export interface PreparedOrderItem {
  id?: string;
  sourceWebsiteOrderItemId?: string | null;
  sourceUpsellOfferId?: string | null;
  productId: string;
  courseNumber?: number;
  position: number;
  productName: string;
  productSku: string;
  unitPrice: string | Prisma.Decimal;
  taxRateSnapshot: string | Prisma.Decimal | null;
  baseUnitPrice: string | Prisma.Decimal;
  quantity: string;
  lineTotal: string;
  note: string | null;
  modifierGroups: ModifierGroupSnapshotDto[];
}
export interface ModifierQuote {
  unitExtraPrice: string;
  snapshots: ModifierGroupSnapshotDto[];
}
