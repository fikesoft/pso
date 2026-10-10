import type { TenantTransaction } from '@pos/db';
import type { KitchenGenerationInput, KitchenGenerationItem } from './kitchen-generation.types';
import { assert } from '../../../shared/lib/http';
/** The caller also commits order state, inventory reservation and audit in this transaction. */
export async function generateKitchenTicket(
  tx: TenantTransaction,
  input: KitchenGenerationInput,
  items: readonly KitchenGenerationItem[],
) {
  const productIds = [...new Set(items.map((item) => item.productId))];
  const unavailable = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT r.id FROM (
      SELECT DISTINCT ON ("productId") id,"stationId" FROM "KitchenRoutingCommand"
      WHERE "organizationId"=${input.organizationId}::uuid AND "locationId"=${input.locationId}::uuid
        AND "productId"=ANY(${productIds}::uuid[]) AND status='SUCCEEDED'
      ORDER BY "productId","resultVersion" DESC
    ) r LEFT JOIN "KitchenStation" s ON s.id=r."stationId"
      AND s."organizationId"=${input.organizationId}::uuid AND s."locationId"=${input.locationId}::uuid
    WHERE r."stationId" IS NOT NULL AND (s.id IS NULL OR s.status<>'ACTIVE')`;
  assert(
    unavailable.length === 0,
    409,
    'Rutarea include o stație arhivată. Actualizați atribuirea produselor.',
  );
  const { actorUserId, ...snapshot } = input;
  const ticket = await tx.kitchenTicket.create({
    data: { ...snapshot, sentByUserId: actorUserId, updatedByUserId: actorUserId },
  });
  await tx.kitchenTicketItem.createMany({
    data: items.map((item) => ({
      organizationId: input.organizationId,
      locationId: input.locationId,
      ticketId: ticket.id,
      orderItemId: item.id,
      position: item.position,
      productName: item.productName,
      productSku: item.productSku,
      quantity: item.quantity,
      note: item.note,
    })),
  });
  return ticket;
}
