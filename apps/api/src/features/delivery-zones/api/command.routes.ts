import type { Router } from 'express';
import {
  deliveryZoneCommandSchema,
  deliveryZoneCommandResponseSchema,
  deliveryZoneResolutionSchema,
  deliveryZoneResolutionResponseSchema,
  idSchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { requireDeliveryZoneAccess } from '../model/delivery-zone-access';
import {
  readDeliveryZoneCommand,
  executeDeliveryZoneCommand,
  deliveryZoneOperationResponse,
} from '../model/delivery-zone-command';
export function addDeliveryZoneCommandRoutes(router: Router) {
  router.post(
    '/delivery-zones/:id/commands',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id),
        body = deliveryZoneCommandSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      requireDeliveryZoneAccess(access, auth.user.id, body.locationId, true);
      const { command, replayed } = await executeDeliveryZoneCommand(
        tx,
        access.org.id,
        auth.user.id,
        id,
        body,
      );
      if (!replayed)
        await audit(
          tx,
          auth,
          req,
          `delivery.zone.${body.action.toLowerCase()}`,
          'DELIVERY_ZONE',
          id,
          body.locationId,
        );
      const response = await deliveryZoneOperationResponse(tx, command);
      assert(response.status === 'SUCCEEDED', 409, 'Tentativa a fost retrasă.');
      return deliveryZoneCommandResponseSchema.parse({
        result: response.result,
        zone: response.zone,
      });
    }),
  );
  router.post(
    '/delivery-zones/:id/commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id),
        body = deliveryZoneResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      requireDeliveryZoneAccess(access, auth.user.id, body.locationId, true);
      let command = await readDeliveryZoneCommand(tx, access.org.id, auth.user.id, id, body);
      if (!command) {
        if (body.action !== 'CREATE')
          assert(
            await tx.deliveryZone.findFirst({
              where: { id, organizationId: access.org.id, locationId: body.locationId },
            }),
            404,
            'Zona nu există.',
          );
        command = await tx.deliveryZoneCommand.create({
          data: {
            organizationId: access.org.id,
            locationId: body.locationId,
            zoneId: id,
            actorUserId: auth.user.id,
            requestKey: body.requestKey,
            action: body.action,
            status: 'RETIRED',
          },
        });
        await audit(
          tx,
          auth,
          req,
          'delivery.zone.command.retired',
          'DELIVERY_ZONE',
          id,
          body.locationId,
        );
      }
      return deliveryZoneResolutionResponseSchema.parse(
        await deliveryZoneOperationResponse(tx, command),
      );
    }),
  );
}
