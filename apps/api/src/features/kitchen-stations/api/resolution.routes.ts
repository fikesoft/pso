import type { Router } from 'express';
import { kitchenStationResolutionSchema } from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { resolveStation } from '../model/station-resolution';
export function addStationResolutionRoute(router: Router) {
  router.post(
    '/kitchen-station-commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = kitchenStationResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await resolveStation(tx, access, auth.user.id, body);
      await audit(
        tx,
        auth,
        req,
        'station.command.resolved',
        'KITCHEN_STATION_COMMAND',
        body.requestKey,
        body.locationId,
      );
      return result;
    }),
  );
}
