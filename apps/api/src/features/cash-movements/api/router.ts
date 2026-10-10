import { Router } from 'express';
import {
  cashMovementCreateSchema,
  cashMovementResolutionSchema,
  cashMovementListSchema,
  idSchema,
} from '@pos/contracts';
import { endpoint, audit } from '../../../entities/tenant-access';
import { requireShiftRead } from '../../../entities/cash-shift';
import { assert } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { createMovement } from '../model/create-movement';
import { resolveMovement } from '../model/resolve-movement';
import { listMovements } from '../model/list-movements';
export function cashMovementsRouter() {
  const router = Router();
  router.use(
    ['/cash-shifts/:id/movements', '/cash-movement-commands/resolution'],
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    },
  );
  router.post(
    '/cash-shifts/:id/movements',
    endpoint(async (tx, access, auth, req) => {
      const body = cashMovementCreateSchema.parse(req.body),
        shiftId = idSchema.parse(req.params.id);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await createMovement(tx, access, auth.user.id, shiftId, body);
      if (!result.replayed)
        await audit(
          tx,
          auth,
          req,
          'cash.movement.created',
          'CASH_MOVEMENT',
          result.movement.id,
          body.locationId,
        );
      return { movement: result.movement };
    }),
  );
  router.post(
    '/cash-movement-commands/resolution',
    endpoint(async (tx, access, auth, req) => {
      const command = cashMovementResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], command.requestKey);
      const result = await resolveMovement(tx, access, auth.user.id, command);
      if (result.retired)
        await audit(
          tx,
          auth,
          req,
          'cash.movement.command.retired',
          'CASH_COMMAND',
          command.requestKey,
          command.locationId,
        );
      return result.response;
    }),
  );
  router.get(
    '/cash-shifts/:id/movements',
    endpoint(
      async (tx, access, auth, req) => {
        const query = cashMovementListSchema.parse(req.query),
          shiftId = idSchema.parse(req.params.id);
        const shift = await tx.cashShift.findFirst({
          where: { id: shiftId, locationId: query.locationId },
        });
        assert(shift, 404, 'Tura nu există');
        requireShiftRead(
          access.service,
          access.org.id,
          auth.user.id,
          query.locationId,
          shift.ownerUserId,
        );
        const location = access.locations.find((row) => row.id === query.locationId);
        assert(location, 404, 'Locația nu există');
        return listMovements(tx, {
          ...query,
          shiftId,
          organizationId: access.org.id,
          actor: auth.user.id,
          timezone: location.timezone,
        });
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  return router;
}
