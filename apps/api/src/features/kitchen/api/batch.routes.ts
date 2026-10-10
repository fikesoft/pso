import type { Router } from 'express';
import { idSchema, updateKitchenTicketSchema } from '@pos/contracts';
import { canPrepareKitchen, ticketResponse } from '../../../entities/order';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireKitchenPermission } from '../model/kitchen-authorization';
import { updateTicketProgress } from '../model/update-ticket-progress';
export function addBatchRoutes(router: Router) {
  router.patch(
    '/kitchen/tickets/:id/batches/:batchId',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const batchId = idSchema.parse(req.params.batchId);
      const body = updateKitchenTicketSchema.parse(req.body);
      const current = await tx.kitchenTicket.findUnique({ where: { id } });
      assert(current, 404, 'Tichetul nu există.');
      requireKitchenPermission(access, auth.user.id, current.locationId, 'kitchen.update');
      const batch = await tx.kitchenTicketBatch.findFirst({
        where: { id: batchId, ticketId: id, locationId: current.locationId },
      });
      assert(batch, 404, 'Grupul stației nu există.');
      assert(batch.version === body.version, 409, 'Grupul a fost modificat. Reîncărcați.');
      assert(batch.firedAt !== null, 409, 'Etapa așteaptă lansarea în bucătărie.');
      assert(
        canPrepareKitchen(batch.status, body.status),
        409,
        'Tranziție de preparare nepermisă.',
      );
      await tx.kitchenTicketBatch.update({
        where: { id: batch.id, version: batch.version },
        data: { status: body.status, version: { increment: 1 }, updatedByUserId: auth.user.id },
      });
      const [aggregate] = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT public.kitchen_batch_status(${access.org.id}::uuid,${id}::uuid) AS status`;
      const ticket = await updateTicketProgress(tx, current, aggregate!.status, auth.user.id);
      await audit(
        tx,
        auth,
        req,
        'kitchen.batch.status.updated',
        'KITCHEN_TICKET_BATCH',
        batch.id,
        current.locationId,
      );
      return { ticket: await ticketResponse(tx, ticket) };
    }),
  );
}
