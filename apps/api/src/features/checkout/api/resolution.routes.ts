import type { Router } from 'express';
import { idSchema, manualCheckoutResolutionSchema } from '@pos/contracts';
import type { ManualCheckoutResolutionResponse } from '@pos/contracts';
import { endpoint, audit } from '../../../entities/tenant-access';
import { receiptResponse } from '../../../entities/order';
import {
  readCashClaim,
  retireCashClaim,
  requireShiftRead,
  lockFinancialOrder,
} from '../../../entities/cash-shift';
import { assert, HttpError } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { requireCheckoutAccess } from '../model/checkout-authorization';
export function addCheckoutResolutionRoute(router: Router) {
  router.post(
    '/orders/:id/manual-checkout-resolution',
    endpoint(async (tx, access, auth, req, res): Promise<ManualCheckoutResolutionResponse> => {
      res.set('Cache-Control', 'no-store');
      const body = manualCheckoutResolutionSchema.parse(req.body),
        orderId = idSchema.parse(req.params.id);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      await lockFinancialOrder(tx, body.locationId, orderId);
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      requireCheckoutAccess(access, auth.user.id, order, 'MANUAL');
      const command = { ...body, kind: 'CHECKOUT_MANUAL' as const, orderId };
      const previous = await tx.checkout.findFirst({
        where: { locationId: body.locationId, requestKey: body.requestKey },
      });
      if (previous) {
        if (previous.orderId !== orderId || previous.mode !== 'MANUAL')
          throw new HttpError(409, 'Cheia aparține altei operațiuni.', 'CASH_COMMAND_CONFLICT');
        if (previous.cashShiftId) {
          const claim = await readCashClaim(tx, command, auth.user.id);
          assert(
            claim?.status === 'SUCCEEDED' && claim.checkoutId === previous.id,
            409,
            'Identitatea operațiunii nu corespunde.',
          );
          requireShiftRead(access.service, access.org.id, auth.user.id, order.locationId);
        }
        return {
          status: 'SUCCEEDED',
          command,
          result: { receipt: await receiptResponse(tx, previous) },
        };
      }
      requireShiftRead(access.service, access.org.id, auth.user.id, order.locationId);
      const claim = await readCashClaim(tx, command, auth.user.id);
      if (!claim) {
        await retireCashClaim(tx, access.org.id, auth.user.id, command);
        await audit(
          tx,
          auth,
          req,
          'checkout.command.retired',
          'CASH_COMMAND',
          body.requestKey,
          body.locationId,
        );
      }
      return { status: 'RETIRED', command };
    }),
  );
}
