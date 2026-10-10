import type { Router } from 'express';
import { fireKitchenCourseSchema, idSchema, resolveKitchenCourseSchema } from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { requireKitchenPermission } from '../model/kitchen-authorization';
import { courseResult, fireCourse, readCourseCommand } from '../model/course-command';

export function addKitchenCourseRoutes(router: Router) {
  router.post(
    '/kitchen/tickets/:id/fire',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id);
      const body = fireKitchenCourseSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const ticket = await tx.kitchenTicket.findFirst({
        where: { id, organizationId: access.org.id },
      });
      assert(ticket, 404, 'Tichetul nu există.');
      requireKitchenPermission(access, auth.user.id, ticket.locationId, 'kitchen.courses.fire');
      const { result, replayed } = await fireCourse(tx, ticket, auth.user.id, body);
      if (!replayed)
        await audit(
          tx,
          auth,
          req,
          'kitchen.course.fired',
          'KITCHEN_TICKET',
          ticket.id,
          ticket.locationId,
        );
      return { result };
    }),
  );
  router.post(
    '/kitchen-course-commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const command = resolveKitchenCourseSchema.parse(req.body);
      const ticket = await tx.kitchenTicket.findFirst({
        where: { id: command.ticketId, organizationId: access.org.id },
      });
      assert(ticket, 404, 'Tichetul nu există.');
      requireKitchenPermission(access, auth.user.id, ticket.locationId, 'kitchen.courses.fire');
      const previous = await readCourseCommand(tx, ticket, auth.user.id, command.requestKey);
      const row =
        previous ??
        (await tx.kitchenCourseCommand.create({
          data: {
            organizationId: access.org.id,
            locationId: ticket.locationId,
            ticketId: ticket.id,
            actorUserId: auth.user.id,
            requestKey: command.requestKey,
            status: 'RETIRED',
          },
        }));
      if (!previous)
        await audit(
          tx,
          auth,
          req,
          'kitchen.course.retired',
          'KITCHEN_TICKET',
          ticket.id,
          ticket.locationId,
        );
      return row.status === 'SUCCEEDED'
        ? { status: 'SUCCEEDED', command, result: courseResult(row) }
        : { status: 'RETIRED', command };
    }),
  );
}
