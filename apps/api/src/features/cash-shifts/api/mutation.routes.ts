import type { Router } from 'express';
import {
  cashShiftOpenSchema,
  cashShiftCloseSchema,
  cashShiftResolutionSchema,
  idSchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { openShift } from '../model/open-shift';
import { closeShift } from '../model/close-shift';
import { resolveShift } from '../model/resolve-shift';
export function addShiftMutationRoutes(router: Router) {
  router.post(
    '/cash-registers/:id/open',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = cashShiftOpenSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await openShift(tx, access, auth.user.id, idSchema.parse(req.params.id), body);
      if (!result.replayed)
        await audit(
          tx,
          auth,
          req,
          'cash.shift.opened',
          'CASH_SHIFT',
          result.shift.id,
          body.locationId,
        );
      return { shift: result.shift };
    }),
  );
  router.post(
    '/cash-shifts/:id/close',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = cashShiftCloseSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await closeShift(
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
          'cash.shift.closed',
          'CASH_SHIFT',
          result.shift.id,
          body.locationId,
        );
      return { shift: result.shift, closing: result.closing };
    }),
  );
  router.post(
    '/cash-commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const command = cashShiftResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], command.requestKey);
      const result = await resolveShift(tx, access, auth.user.id, command);
      await audit(
        tx,
        auth,
        req,
        'cash.shift.command.resolved',
        'CASH_COMMAND',
        command.requestKey,
        command.locationId,
      );
      return result;
    }),
  );
}
