import type { Router } from 'express';
import {
  kitchenStationCreateSchema,
  kitchenStationUpdateSchema,
  kitchenStationArchiveSchema,
  idSchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import type { TenantHandler } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { mutateStation } from '../model/station-mutation';
import { STATION_AUDIT_ACTIONS } from '../config/station.constants';
import type { StationMutation } from '../model/station-command.types';
function mutationHandler(kind: StationMutation['kind']): TenantHandler {
  return async (tx, access, auth, req, res) => {
    res.set('Cache-Control', 'no-store');
    const command: StationMutation =
      kind === 'CREATE'
        ? { kind, body: kitchenStationCreateSchema.parse(req.body) }
        : kind === 'UPDATE'
          ? {
              kind,
              stationId: idSchema.parse(req.params.id),
              body: kitchenStationUpdateSchema.parse(req.body),
            }
          : {
              kind,
              stationId: idSchema.parse(req.params.id),
              body: kitchenStationArchiveSchema.parse(req.body),
            };
    validateIdempotencyHeader(req.headers['idempotency-key'], command.body.requestKey);
    const result = await mutateStation(tx, access, auth.user.id, command);
    if (!result.replayed)
      await audit(
        tx,
        auth,
        req,
        STATION_AUDIT_ACTIONS[kind],
        'KITCHEN_STATION',
        result.station.id,
        result.station.locationId,
      );
    return { station: result.station };
  };
}
export function addStationMutationRoutes(router: Router) {
  router.post('/kitchen-stations', endpoint(mutationHandler('CREATE')));
  router.patch('/kitchen-stations/:id', endpoint(mutationHandler('UPDATE')));
  router.post('/kitchen-stations/:id/archive', endpoint(mutationHandler('ARCHIVE')));
}
