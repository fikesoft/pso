import type { Router } from 'express';
import { billPlanResolutionSchema } from '@pos/contracts';
import { endpoint, audit } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { resolvePlan } from '../model/resolve-plan';
export function addBillPlanResolutionRoute(router: Router) {
  router.post(
    '/bill-plan-commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const command = billPlanResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], command.requestKey);
      const result = await resolvePlan(tx, access, auth.user.id, command);
      if (result.status === 'RETIRED')
        await audit(
          tx,
          auth,
          req,
          'bill.plan.command.retired',
          'BILL_PLAN_COMMAND',
          command.requestKey,
          command.locationId,
        );
      return result;
    }),
  );
}
