import type { Router } from 'express';
import {
  kitchenRoutingReadSchema,
  kitchenRoutingSetSchema,
  kitchenRoutingIdentitySchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { requireStationAccess } from '../model/station-access';
import {
  currentRouting,
  setRouting,
  resolveRouting,
  routingResponse,
} from '../model/routing-command';
export function addRoutingRoutes(router: Router) {
  router.get(
    '/kitchen-routing',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = kitchenRoutingReadSchema.parse(req.query);
      requireStationAccess(access, auth.user.id, query.locationId);
      return {
        routing: await currentRouting(tx, access.org.id, query.locationId, query.productId),
      };
    }),
  );
  router.put(
    '/kitchen-routing',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = kitchenRoutingSetSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      requireStationAccess(access, auth.user.id, body.locationId, true);
      const result = await setRouting(tx, access.org.id, auth.user.id, body);
      if (!result.replayed)
        await audit(
          tx,
          auth,
          req,
          'kitchen.routing.updated',
          'PRODUCT',
          body.productId,
          body.locationId,
        );
      return { routing: result.routing };
    }),
  );
  router.post(
    '/kitchen-routing-commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const command = kitchenRoutingIdentitySchema.parse(req.body);
      requireStationAccess(access, auth.user.id, command.locationId, true);
      const row = await resolveRouting(tx, access.org.id, auth.user.id, command);
      return row.status === 'SUCCEEDED'
        ? { status: 'SUCCEEDED', command, result: { routing: routingResponse(row) } }
        : { status: 'RETIRED', command };
    }),
  );
}
