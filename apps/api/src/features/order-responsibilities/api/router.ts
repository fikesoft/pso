import { Router } from 'express';
import {
  orderResponsibilityListSchema,
  orderResponsibilityDetailSchema,
  orderResponsibilityHistorySchema,
  orderResponsibilityCommandSchema,
  orderResponsibilityResolutionSchema,
} from '@pos/contracts/order-responsibilities';
import { idSchema } from '@pos/contracts';
import { endpoint, audit } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { executeResponsibility } from '../model/execute-responsibility';
import { resolveResponsibility } from '../model/resolve-responsibility';
import { listResponsibilities } from '../model/list-responsibilities';
import { readResponsibility } from '../model/read-responsibility';
import { responsibilityHistory } from '../model/responsibility-history';
export function orderResponsibilitiesRouter() {
  const router = Router();
  router.use(
    [
      '/order-responsibilities',
      '/orders/:id/responsibility',
      '/orders/:id/responsibility-events',
      '/orders/:id/responsibility-commands',
    ],
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    },
  );
  router.get(
    '/order-responsibilities',
    endpoint(
      async (tx, access, auth, req) => {
        const query = orderResponsibilityListSchema.parse(req.query);
        const location = access.locations.find((row) => row.id === query.locationId);
        assert(location, 404, 'Locația nu există.');
        return listResponsibilities(tx, access, {
          organizationId: access.org.id,
          actor: auth.user.id,
          timezone: location.timezone,
          query,
        });
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/orders/:id/responsibility',
    endpoint(
      async (tx, access, auth, req) => {
        const { locationId } = orderResponsibilityDetailSchema.parse(req.query);
        return readResponsibility(
          tx,
          access,
          auth.user.id,
          idSchema.parse(req.params.id),
          locationId,
        );
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/orders/:id/responsibility-events',
    endpoint(
      async (tx, access, auth, req) => {
        const query = orderResponsibilityHistorySchema.parse(req.query);
        const location = access.locations.find((row) => row.id === query.locationId);
        assert(location, 404, 'Locația nu există.');
        return responsibilityHistory(
          tx,
          access,
          {
            organizationId: access.org.id,
            actor: auth.user.id,
            locationId: query.locationId,
            orderId: idSchema.parse(req.params.id),
            limit: query.limit,
            timezone: location.timezone,
          },
          query.cursor,
        );
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.post(
    '/orders/:id/responsibility-commands',
    endpoint(async (tx, access, auth, req) => {
      const body = orderResponsibilityCommandSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await executeResponsibility(
        tx,
        access,
        auth.user.id,
        idSchema.parse(req.params.id),
        body,
      );
      if (!result.replayed)
        await audit(
          tx,
          auth,
          req,
          'orders.responsibility.changed',
          'ORDER_RESPONSIBILITY_EVENT',
          result.event.eventId,
          body.locationId,
        );
      return { event: result.event };
    }),
  );
  router.post(
    '/orders/:id/responsibility-commands/resolution',
    endpoint(async (tx, access, auth, req) => {
      const body = orderResponsibilityResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await resolveResponsibility(tx, access, auth.user.id, {
        ...body,
        orderId: idSchema.parse(req.params.id),
      });
      if (result.retired)
        await audit(
          tx,
          auth,
          req,
          'orders.responsibility.command.retired',
          'ORDER_RESPONSIBILITY_COMMAND',
          body.requestKey,
          body.locationId,
        );
      return result.response;
    }),
  );
  return router;
}
