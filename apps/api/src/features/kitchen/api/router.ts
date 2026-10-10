import { idSchema, kitchenQuerySchema, updateKitchenTicketSchema } from '@pos/contracts';
import { Router } from 'express';
import { canPrepareKitchen, ticketResponse } from '../../../entities/order';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireKitchenPermission } from '../model/kitchen-authorization';
import { listActiveTickets } from '../model/list-active-tickets';
import { updateTicketProgress } from '../model/update-ticket-progress';
import { addBatchRoutes } from './batch.routes';
import { addKitchenStationOptionsRoute } from './station-options.routes';
import { addKitchenArrivalRoute } from './arrival.routes';
import { addKitchenRecipeRoute } from './recipe.routes';
import { addKitchenCourseRoutes } from './course.routes';
import type { KitchenServerClock } from '../model/kitchen.types';

export function kitchenRouter() {
  const router = Router();
  addBatchRoutes(router);
  addKitchenStationOptionsRoute(router);
  addKitchenArrivalRoute(router);
  addKitchenRecipeRoute(router);
  addKitchenCourseRoutes(router);
  router.get(
    '/kitchen/tickets',
    endpoint(async (tx, access, auth, req) => {
      const query = kitchenQuerySchema.parse(req.query);
      requireKitchenPermission(access, auth.user.id, query.locationId, 'kitchen.read');
      const tickets = await listActiveTickets(tx, query);
      const responses = await Promise.all(
        tickets.slice(0, query.limit).map((ticket) => ticketResponse(tx, ticket)),
      );
      const [clock] = await tx.$queryRaw<
        KitchenServerClock[]
      >`SELECT clock_timestamp() AS "serverTime"`;
      return {
        serverTime: clock!.serverTime.toISOString(),
        tickets: responses,
        nextCursor: tickets.length > query.limit ? tickets[query.limit - 1]!.id : null,
      };
    }),
  );
  router.patch(
    '/kitchen/tickets/:id',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const body = updateKitchenTicketSchema.parse(req.body);
      const current = await tx.kitchenTicket.findUnique({ where: { id } });
      assert(current, 404, 'Ticketul nu există');
      requireKitchenPermission(access, auth.user.id, current.locationId, 'kitchen.update');
      assert(current.version === body.version, 409, 'Ticketul a fost modificat. Reîncărcați.');
      assert(
        canPrepareKitchen(current.status, body.status),
        409,
        'Tranziție de preparare nepermisă',
      );
      const routed = await tx.kitchenTicketBatch.count({
        where: { ticketId: id, OR: [{ stationId: { not: null } }, { courseNumber: { not: 0 } }] },
      });
      assert(routed === 0, 409, 'Actualizați separat grupurile stațiilor.');
      const ticket = await updateTicketProgress(tx, current, body.status, auth.user.id);
      await audit(
        tx,
        auth,
        req,
        'kitchen.status.updated',
        'KITCHEN_TICKET',
        id,
        current.locationId,
      );
      return { ticket: await ticketResponse(tx, ticket) };
    }),
  );
  return router;
}
