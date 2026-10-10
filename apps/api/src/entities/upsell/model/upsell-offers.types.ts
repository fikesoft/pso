import type { TenantTransaction } from '@pos/db';
export type StoredUpsellOffer = Awaited<
  ReturnType<TenantTransaction['upsellOffer']['findFirstOrThrow']>
>;
export interface UpsellAttributionInput {
  id?: string;
  productId: string;
  sourceUpsellOfferId?: string;
}
