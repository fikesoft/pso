import { Prisma } from '@pos/db';
import type { TenantTransaction } from '@pos/db';
export async function prepareResponsibility(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  orderId: string,
  shifts: readonly (string | undefined | null)[] = [],
) {
  const ids = shifts.filter((id): id is string => Boolean(id));
  const array = ids.length
    ? Prisma.sql`ARRAY[${Prisma.join(ids)}]::uuid[]`
    : Prisma.sql`ARRAY[]::uuid[]`;
  await tx.$queryRaw`SELECT public.prepare_order_responsibility(${organizationId}::uuid,${locationId}::uuid,${orderId}::uuid,${array})::text`;
}
export async function prepareResponsibilityClose(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  shiftId: string,
) {
  await tx.$queryRaw`SELECT public.prepare_responsibility_close(${organizationId}::uuid,${locationId}::uuid,${shiftId}::uuid)::text`;
}
