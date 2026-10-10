import type { TenantTransaction } from '@pos/db';
export type CourierRow = Awaited<ReturnType<TenantTransaction['courier']['findUniqueOrThrow']>>;
export type CourierCommandRow = Awaited<
  ReturnType<TenantTransaction['courierCommand']['findUniqueOrThrow']>
>;
