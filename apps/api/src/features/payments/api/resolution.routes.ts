import type { Router } from 'express';
import { idSchema, paymentCommandResolutionSchema } from '@pos/contracts';
import type { PaymentCommandResolutionResponse } from '@pos/contracts';
import { endpoint, audit } from '../../../entities/tenant-access';
import {
  readCashClaim,
  retireCashClaim,
  requireShiftRead,
  lockFinancialOrder,
} from '../../../entities/cash-shift';
import { assert, HttpError } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { requirePaymentAccess } from '../model/payment-access';
import { operationResponse } from '../model/operation-response';
export function addPaymentResolutionRoute(router: Router) {
  router.post(
    '/orders/:id/payment-commands/resolution',
    endpoint(async (tx, access, auth, req, res): Promise<PaymentCommandResolutionResponse> => {
      res.set('Cache-Control', 'no-store');
      const body = paymentCommandResolutionSchema.parse(req.body),
        orderId = idSchema.parse(req.params.id);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      await lockFinancialOrder(tx, body.locationId, orderId);
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const permission = body.kind === 'COLLECT' ? 'payments.collect' : 'payments.refund';
      requirePaymentAccess(
        access,
        auth.user.id,
        order.locationId,
        order.total.toFixed(2),
        permission,
      );
      const command = { ...body, orderId };
      const previous = await tx.paymentOperation.findFirst({
        where: { locationId: body.locationId, requestKey: body.requestKey },
      });
      if (previous) {
        if (previous.orderId !== orderId || previous.kind !== body.kind)
          throw new HttpError(409, 'Cheia aparține altei operațiuni.', 'CASH_COMMAND_CONFLICT');
        requirePaymentAccess(
          access,
          auth.user.id,
          order.locationId,
          order.total.toFixed(2),
          permission,
          previous.amount.toFixed(2),
        );
        if (previous.cashShiftId) {
          const claim = await readCashClaim(tx, command, auth.user.id);
          assert(
            claim?.status === 'SUCCEEDED' && claim.paymentOperationId === previous.id,
            409,
            'Identitatea operațiunii nu corespunde.',
          );
          requireShiftRead(access.service, access.org.id, auth.user.id, order.locationId);
        }
        return { status: 'SUCCEEDED', command, result: { operation: operationResponse(previous) } };
      }
      requireShiftRead(access.service, access.org.id, auth.user.id, order.locationId);
      const claim = await readCashClaim(tx, command, auth.user.id);
      if (!claim) {
        await retireCashClaim(tx, access.org.id, auth.user.id, command);
        await audit(
          tx,
          auth,
          req,
          'payment.command.retired',
          'CASH_COMMAND',
          body.requestKey,
          body.locationId,
        );
      }
      return { status: 'RETIRED', command };
    }),
  );
}
