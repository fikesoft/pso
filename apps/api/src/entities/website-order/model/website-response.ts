import type {
  WebsiteApiKey,
  WebsiteConnection,
  WebsiteInboxOrder,
  WebsiteOrderDetails,
  WebsiteOrderReceipt,
} from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { loadWebsiteOrderItemModifierSnapshots } from './website-modifier-snapshots';
import type {
  StoredWebsiteConnection,
  StoredWebsiteKey,
  StoredWebsiteOrder,
} from './website.types';
import { decryptWebsiteData } from './website-crypto';

export function websiteKeyResponse(key: StoredWebsiteKey): WebsiteApiKey {
  return {
    id: key.id,
    connectionId: key.connectionId,
    name: key.name,
    createdAt: key.createdAt.toISOString(),
    expiresAt: key.expiresAt.toISOString(),
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}
export async function websiteConnectionResponse(
  tx: TenantTransaction,
  connection: StoredWebsiteConnection,
): Promise<WebsiteConnection> {
  const location = await tx.location.findUniqueOrThrow({ where: { id: connection.locationId } });
  const keys = await tx.websiteApiKey.findMany({
    where: { connectionId: connection.id },
    orderBy: { createdAt: 'desc' },
  });
  return {
    id: connection.id,
    name: connection.name,
    locationId: location.id,
    locationName: location.name,
    locationCode: location.code,
    status: connection.status as WebsiteConnection['status'],
    version: connection.version,
    createdAt: connection.createdAt.toISOString(),
    keys: keys.map(websiteKeyResponse),
  };
}
export function websiteReceipt(order: StoredWebsiteOrder): WebsiteOrderReceipt {
  return {
    id: order.id,
    externalOrderId: order.externalOrderId,
    status:
      order.status === 'PENDING'
        ? 'AWAITING_ACCEPTANCE'
        : (order.status as WebsiteOrderReceipt['status']),
    version: order.version,
    orderId: order.orderId,
    total: order.total.toFixed(2),
    currency: 'MDL',
    receivedAt: order.createdAt.toISOString(),
    rejectionReason: order.rejectionReason,
  };
}
export async function websiteInboxResponse(
  tx: TenantTransaction,
  order: StoredWebsiteOrder,
): Promise<WebsiteInboxOrder> {
  const connection = await tx.websiteConnection.findUniqueOrThrow({
    where: { id: order.connectionId },
  });
  return {
    ...websiteReceipt(order),
    connectionId: connection.id,
    connectionName: connection.name,
    locationId: order.locationId,
  };
}
export async function websiteOrderResponse(
  tx: TenantTransaction,
  order: StoredWebsiteOrder,
): Promise<WebsiteOrderDetails> {
  const items = await tx.websiteOrderItem.findMany({
    where: { websiteOrderId: order.id },
    orderBy: { position: 'asc' },
  });
  const modifierGroups = await loadWebsiteOrderItemModifierSnapshots(
    tx,
    items.map((item) => item.id),
  );
  return {
    ...(await websiteInboxResponse(tx, order)),
    ...decryptWebsiteData(order, order.customerDataEncrypted),
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      productSku: item.productSku,
      unitPrice: item.unitPrice.toFixed(4),
      taxRateSnapshot: item.taxRateSnapshot?.toFixed(4) ?? null,
      quantity: item.quantity.toFixed(3),
      lineTotal: item.lineTotal.toFixed(2),
      note: item.note,
      modifierGroups: modifierGroups.get(item.id) ?? [],
    })),
  };
}
