import type { Router } from 'express';
import { cashRegisterResolutionSchema } from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { resolveRegister } from '../model/register-resolution';
export function addRegisterResolutionRoute(router: Router) {
  router.post(
    '/cash-register-commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = cashRegisterResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await resolveRegister(tx, access, auth.user.id, body);
      await audit(
        tx,
        auth,
        req,
        'cash.register.command.resolved',
        'CASH_REGISTER_COMMAND',
        body.requestKey,
        body.locationId,
      );
      return result;
    }),
  );
}
