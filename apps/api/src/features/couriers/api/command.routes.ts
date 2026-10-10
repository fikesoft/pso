import type { Router } from 'express';
import {
  courierCommandSchema,
  courierResolutionSchema,
  courierCommandResponseSchema,
  courierResolutionResponseSchema,
  idSchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { requireCourierCommand } from '../model/courier-access';
import {
  readCourierCommand,
  executeCourierCommand,
  courierOperationResponse,
} from '../model/courier-command';
export function addCourierCommandRoutes(router: Router) {
  router.post(
    '/couriers/:id/commands',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id),
        body = courierCommandSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const row = await tx.courier.findFirst({
        where: { id, organizationId: access.org.id, locationId: body.locationId },
      });
      requireCourierCommand(access, auth.user.id, body.locationId, body.action, row?.userId);
      const { command, replayed } = await executeCourierCommand(tx, access, auth.user.id, id, body);
      if (!replayed)
        await audit(
          tx,
          auth,
          req,
          `couriers.${body.action.toLowerCase()}`,
          'COURIER',
          id,
          body.locationId,
        );
      const result = await courierOperationResponse(tx, access, command);
      assert(result.status === 'SUCCEEDED', 409, 'Tentativa a fost retrasă.');
      return courierCommandResponseSchema.parse({ result: result.result, courier: result.courier });
    }),
  );
  router.post(
    '/couriers/:id/commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id),
        body = courierResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const row = await tx.courier.findFirst({
        where: { id, organizationId: access.org.id, locationId: body.locationId },
      });
      requireCourierCommand(access, auth.user.id, body.locationId, body.action, row?.userId);
      let command = await readCourierCommand(tx, access.org.id, auth.user.id, id, body);
      if (!command) {
        if (body.action !== 'CREATE') assert(row, 404, 'Curierul nu există.');
        command = await tx.courierCommand.create({
          data: {
            organizationId: access.org.id,
            locationId: body.locationId,
            courierId: id,
            actorUserId: auth.user.id,
            requestKey: body.requestKey,
            action: body.action,
            status: 'RETIRED',
          },
        });
        await audit(tx, auth, req, 'couriers.command.retired', 'COURIER', id, body.locationId);
      }
      return courierResolutionResponseSchema.parse(
        await courierOperationResponse(tx, access, command),
      );
    }),
  );
}
