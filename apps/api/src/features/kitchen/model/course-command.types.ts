import type { TenantTransaction } from '@pos/db';

export type StoredCourseCommand = Awaited<
  ReturnType<TenantTransaction['kitchenCourseCommand']['findFirstOrThrow']>
>;
