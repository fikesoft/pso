import type { TenantTransaction } from '@pos/db';
export async function visitMemberIds(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  id: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public.table_visit_members(${organizationId}::uuid,${locationId}::uuid,${id}::uuid)`;
  return rows.map((row) => row.id);
}
