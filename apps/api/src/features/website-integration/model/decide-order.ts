import { randomUUID } from 'node:crypto';
import { WEBSITE_PRODUCT_UNAVAILABLE } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { Request } from 'express';
import {
  orderAddressColumns,
  orderCustomerColumns,
  replaceDraftItems,
} from '../../../entities/order';
import { requireScheduleAvailability } from '../../../entities/menu-schedule';
import { audit } from '../../../entities/tenant-access';
import type { AccessData } from '../../../entities/tenant-access';
import { decryptWebsiteData, websiteOrderResponse } from '../../../entities/website-order';
import type { StoredWebsiteOrder } from '../../../entities/website-order';
import { assert, HttpError } from '../../../shared/lib/http';
import type { TenantAuthState } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { requireWebsiteOrderAccess } from './website-authorization';
import { loadWebsiteModifierSnapshots } from './website-modifier-snapshots';

async function response(tx: TenantTransaction, order: StoredWebsiteOrder) {
  return { websiteOrder: await websiteOrderResponse(tx, order), orderId: order.orderId };
}
export async function decideWebsiteOrder(
  tx: TenantTransaction,
  access: AccessData,
  auth: TenantAuthState,
  req: Request,
  id: string,
  version: number,
  rejectionReason?: string,
) {
  const current = await tx.websiteOrder.findUnique({ where: { id } });
  assert(current, 404, 'Comanda website nu există');
  requireWebsiteOrderAccess(
    access,
    auth.user.id,
    current.locationId,
    current.total.toFixed(2),
    true,
  );
  const status = rejectionReason === undefined ? 'ACCEPTED' : 'REJECTED';
  if (current.status === status) {
    assert(
      status !== 'REJECTED' || current.rejectionReason === rejectionReason,
      409,
      'Comanda a fost deja refuzată cu alt motiv',
    );
    return response(tx, current);
  }
  assert(
    current.status === 'PENDING' && current.version === version,
    409,
    'Comanda website a fost deja modificată. Reîncărcați.',
  );
  let orderId: string | null = null;
  if (status === 'ACCEPTED') {
    const items = await tx.websiteOrderItem.findMany({
      where: { websiteOrderId: id },
      orderBy: { position: 'asc' },
    });
    const ids = [...new Set(items.map((item) => item.productId))];
    await requireScheduleAvailability(tx, current.locationId, ids);
    const products = await tx.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' } });
    const enabled = await tx.locationProduct.findMany({
      where: { productId: { in: ids }, locationId: current.locationId, enabled: true },
    });
    if (products.length !== ids.length || enabled.length !== ids.length)
      throw new HttpError(
        409,
        'Un produs nu mai este disponibil în locație. Verificați comanda.',
        WEBSITE_PRODUCT_UNAVAILABLE,
      );
    const modifierSnapshots = await loadWebsiteModifierSnapshots(tx, items);
    const latest = await tx.order.aggregate({
      where: { locationId: current.locationId },
      _max: { number: true },
    });
    const acceptedOrderId = randomUUID();
    const privateData = decryptWebsiteData(current, current.customerDataEncrypted);
    const order = await tx.order.create({
      data: {
        id: acceptedOrderId,
        organizationId: access.org.id,
        locationId: current.locationId,
        ...orderCustomerColumns(
          { id: acceptedOrderId, organizationId: access.org.id, locationId: current.locationId },
          privateData.customer,
        ),
        ...orderAddressColumns(
          { id: acceptedOrderId, organizationId: access.org.id, locationId: current.locationId },
          privateData.delivery,
        ),
        source: 'WEB',
        number: (latest._max.number ?? 0) + 1,
        serviceType: 'DELIVERY',
        total: current.total,
        clientRequestId: randomUUID(),
        creationRequestHash: requestHash({ websiteOrderId: id }),
        createdByUserId: auth.user.id,
        updatedByUserId: auth.user.id,
      },
    });
    await replaceDraftItems(
      tx,
      order.id,
      access.org.id,
      current.locationId,
      items.map((item) => ({
        productId: item.productId,
        position: item.position,
        productName: item.productName,
        productSku: item.productSku,
        unitPrice: item.unitPrice,
        taxRateSnapshot: item.taxRateSnapshot,
        baseUnitPrice: item.baseUnitPrice,
        sourceWebsiteOrderItemId: item.id,
        quantity: item.quantity.toFixed(3),
        lineTotal: item.lineTotal.toFixed(2),
        note: item.note,
        modifierGroups: modifierSnapshots.get(item.id) ?? [],
      })),
    );
    await tx.orderStatusEvent.create({
      data: {
        organizationId: access.org.id,
        locationId: current.locationId,
        orderId: order.id,
        kind: 'ORDER',
        toStatus: 'DRAFT',
        actorUserId: auth.user.id,
      },
    });
    orderId = order.id;
  }
  const updated = await tx.websiteOrder.update({
    where: { id },
    data: {
      status,
      orderId,
      decisionByUserId: auth.user.id,
      decidedAt: new Date(),
      rejectionReason: rejectionReason ?? null,
      version: { increment: 1 },
    },
  });
  await audit(
    tx,
    auth,
    req,
    status === 'ACCEPTED' ? 'website.order.accepted' : 'website.order.rejected',
    'WEBSITE_ORDER',
    id,
    current.locationId,
  );
  return response(tx, updated);
}
