import { resolveKitchenAlert } from '@pos/contracts';
import type {
  KitchenAlertContext,
  KitchenAlertIdentity,
  KitchenAlertPreviewResponse,
} from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { alertResponse, alertIdentityFields } from './alert-command';
import type { StoredAlertCommand } from './alert-command.types';

export async function previewAlert(
  tx: TenantTransaction,
  organizationId: string,
  identity: KitchenAlertIdentity,
): Promise<KitchenAlertPreviewResponse> {
  const { scope, target } = identity;
  const locationId = scope.scopeType === 'LOCATION' ? scope.locationId : null;
  const context: KitchenAlertContext = {
    locationId: locationId ?? '',
    productId: target.kind === 'PRODUCT' ? target.productId : '',
    categoryId: target.kind === 'CATEGORY' ? target.categoryId : null,
    stationId: target.kind === 'STATION' ? target.stationId : null,
  };
  if (target.kind === 'PRODUCT') {
    const product = await tx.product.findFirstOrThrow({
      where: { organizationId, id: target.productId },
    });
    context.categoryId = product.categoryId;
    if (locationId)
      context.stationId =
        (
          await tx.kitchenRoutingCommand.findFirst({
            where: { organizationId, locationId, productId: target.productId, status: 'SUCCEEDED' },
            orderBy: { resultVersion: 'desc' },
          })
        )?.stationId ?? null;
  }
  const rows = await tx.$queryRaw<StoredAlertCommand[]>`
    SELECT DISTINCT ON ("locationId","targetKind","stationId","categoryId","productId") *
    FROM "KitchenAlertCommand" WHERE "organizationId"=${organizationId}::uuid AND status='SUCCEEDED'
      AND ("locationId" IS NULL OR "locationId"=${locationId}::uuid)
      AND ("targetKind"='DEFAULT' OR "productId"=${context.productId || null}::uuid
        OR "categoryId"=${context.categoryId}::uuid OR "stationId"=${context.stationId}::uuid)
    ORDER BY "locationId","targetKind","stationId","categoryId","productId","resultVersion" DESC`;
  const own = alertIdentityFields(identity);
  return {
    effective: resolveKitchenAlert(rows.map(alertResponse), context),
    inherited: resolveKitchenAlert(
      rows
        .filter(
          (row) =>
            !Object.entries(own).every(([key, value]) => row[key as keyof typeof own] === value),
        )
        .map(alertResponse),
      context,
    ),
  };
}
