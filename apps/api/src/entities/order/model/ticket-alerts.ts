import type { TenantTransaction } from '@pos/db';
import type { TicketAlertRuleRow, TicketAlertRules } from './ticket-alerts.types';

export async function ticketAlertRules(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  productIds: string[],
  categoryIds: string[],
  stationIds: string[],
): Promise<TicketAlertRules> {
  const rows = await tx.$queryRaw<TicketAlertRuleRow[]>`
    SELECT DISTINCT ON ("locationId","targetKind","stationId","categoryId","productId")
      "scopeType","locationId","targetKind","stationId","categoryId","productId",
      "resultVersion","warningSeconds","criticalSeconds"
    FROM "KitchenAlertCommand" WHERE "organizationId"=${organizationId}::uuid
      AND ("locationId" IS NULL OR "locationId"=${locationId}::uuid) AND status='SUCCEEDED'
      AND ("targetKind"='DEFAULT' OR "productId"=ANY(${productIds}::uuid[])
        OR "categoryId"=ANY(${categoryIds}::uuid[]) OR "stationId"=ANY(${stationIds}::uuid[]))
    ORDER BY "locationId","targetKind","stationId","categoryId","productId","resultVersion" DESC`;
  return rows.map((row) => ({
    scope:
      row.scopeType === 'ORGANIZATION'
        ? { scopeType: 'ORGANIZATION' }
        : { scopeType: 'LOCATION', locationId: row.locationId! },
    target:
      row.targetKind === 'PRODUCT'
        ? { kind: 'PRODUCT', productId: row.productId! }
        : row.targetKind === 'CATEGORY'
          ? { kind: 'CATEGORY', categoryId: row.categoryId! }
          : row.targetKind === 'STATION'
            ? { kind: 'STATION', stationId: row.stationId! }
            : { kind: 'DEFAULT' },
    version: row.resultVersion,
    thresholds:
      row.warningSeconds === null
        ? null
        : { warningSeconds: row.warningSeconds, criticalSeconds: row.criticalSeconds! },
  }));
}
