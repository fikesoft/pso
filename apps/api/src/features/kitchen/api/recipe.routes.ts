import type { Router } from 'express';
import { idSchema } from '@pos/contracts';
import type { KitchenRecipeResponse } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireKitchenPermission } from '../model/kitchen-authorization';
import { readKitchenRecipeComponents } from '../model/read-kitchen-recipe';

export function addKitchenRecipeRoute(router: Router) {
  router.get(
    '/kitchen/tickets/:ticketId/items/:itemId/recipe',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const ticketId = idSchema.parse(req.params.ticketId);
        const itemId = idSchema.parse(req.params.itemId);
        const ticket = await tx.kitchenTicket.findFirst({
          where: { id: ticketId, organizationId: access.org.id },
        });
        assert(ticket, 404, 'Tichetul nu există.');
        requireKitchenPermission(access, auth.user.id, ticket.locationId, 'kitchen.read');
        const item = await tx.kitchenTicketItem.findFirst({
          where: {
            id: itemId,
            organizationId: access.org.id,
            locationId: ticket.locationId,
            ticketId,
          },
        });
        assert(item, 404, 'Articolul nu există în acest tichet.');
        const reservation = await tx.inventoryReservation.findFirst({
          where: {
            organizationId: access.org.id,
            locationId: ticket.locationId,
            orderId: ticket.orderId,
          },
        });
        const components = reservation
          ? await readKitchenRecipeComponents(
              tx,
              access.org.id,
              ticket.locationId,
              item.orderItemId,
            )
          : [];
        const result: KitchenRecipeResponse = {
          ticketId,
          ticketItemId: item.id,
          productName: item.productName,
          quantity: item.quantity.toFixed(3),
          status: !reservation
            ? 'LEGACY_UNAVAILABLE'
            : components.length
              ? 'AVAILABLE'
              : 'NO_COMPONENTS',
          components,
        };
        return result;
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
