import type { Router } from 'express';
import {
  idSchema,
  courierAcceptanceSchema,
  courierAcceptanceResolutionSchema,
  courierAcceptanceResponseSchema,
  courierAcceptanceResolutionResponseSchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import {
  acceptanceContext,
  readAcceptance,
  executeAcceptance,
  acceptanceResult,
} from '../model/courier-acceptance';
import { courierWorkView } from '../model/courier-work-view';
export function addCourierAcceptanceRoutes(router: Router) {
  router.post(
    '/courier-work/:id/accept',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const orderId = idSchema.parse(req.params.id),
        body = courierAcceptanceSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const { command, order, replayed } = await executeAcceptance(
        tx,
        access,
        auth.user.id,
        orderId,
        body,
      );
      if (!replayed)
        await audit(
          tx,
          auth,
          req,
          'courier.delivery.accepted',
          'COURIER_ACCEPTANCE',
          command.id,
          body.locationId,
        );
      return courierAcceptanceResponseSchema.parse({
        result: acceptanceResult(command),
        order: await courierWorkView(tx, order),
      });
    }),
  );
  router.post(
    '/courier-work/:id/accept/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const orderId = idSchema.parse(req.params.id),
        body = courierAcceptanceResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const { order, profile } = await acceptanceContext(tx, access, auth.user.id, orderId, body);
      let command = await readAcceptance(tx, access.org.id, auth.user.id, orderId, body);
      if (!command) {
        command = await tx.courierAcceptanceCommand.create({
          data: {
            organizationId: access.org.id,
            locationId: body.locationId,
            orderId,
            assignmentId: body.assignmentId,
            courierId: profile.id,
            actorUserId: auth.user.id,
            requestKey: body.requestKey,
            status: 'RETIRED',
          },
        });
        await audit(
          tx,
          auth,
          req,
          'courier.acceptance.retired',
          'COURIER_ACCEPTANCE',
          command.id,
          body.locationId,
        );
      }
      return courierAcceptanceResolutionResponseSchema.parse(
        command.status === 'RETIRED'
          ? { status: 'RETIRED', ...body, orderId }
          : {
              status: 'SUCCEEDED',
              result: acceptanceResult(command),
              order: await courierWorkView(tx, order),
            },
      );
    }),
  );
}
