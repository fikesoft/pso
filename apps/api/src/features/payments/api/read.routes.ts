import type { Router } from 'express';
import type { PaymentMethod, PaymentRecord } from '@pos/contracts';
import { idSchema, paymentQuerySchema } from '@pos/contracts';
import { paymentSummary } from '../../../entities/order';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { decimalString, decimalUnits } from '../../../shared/lib/money';
import { PAYMENT_PAGE_SIZE } from '../config/payments.constants';
import { requirePaymentAccess } from '../model/payment-access';
import { operationResponse } from '../model/operation-response';

export function addPaymentReadRoutes(router: Router) {
  router.get(
    '/orders/:id/payments',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const orderId = idSchema.parse(req.params.id);
      const query = paymentQuerySchema.parse(req.query);
      const order = await tx.order.findUnique({ where: { id: orderId } });
      assert(order, 404, 'Comanda nu există');
      requirePaymentAccess(access, auth.user.id, order.locationId, order.total.toFixed(2));
      if (query.cursor)
        assert(
          await tx.payment.findFirst({ where: { id: query.cursor, orderId } }),
          400,
          'Cursorul nu aparține comenzii',
        );
      const stored = await tx.payment.findMany({
        where: { orderId },
        take: PAYMENT_PAGE_SIZE + 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const page = stored.slice(0, PAYMENT_PAGE_SIZE);
      const [refunds, checkouts] = await Promise.all([
        tx.paymentRefund.groupBy({
          by: ['paymentId'],
          where: { paymentId: { in: page.map((p) => p.id) } },
          _sum: { amount: true },
        }),
        tx.checkout.findMany({
          where: { id: { in: page.flatMap((p) => (p.checkoutId ? [p.checkoutId] : [])) } },
        }),
      ]);
      const payments: PaymentRecord[] = page.map((payment) => {
        const refunded =
          refunds.find((r) => r.paymentId === payment.id)?._sum.amount?.toFixed(2) ?? '0.00';
        const checkout = checkouts.find((c) => c.id === payment.checkoutId);
        return {
          id: payment.id,
          method: payment.method as PaymentMethod,
          amount: payment.amount.toFixed(2),
          refundedAmount: refunded,
          refundableAmount: decimalString(
            decimalUnits(payment.amount.toFixed(2), 2) - decimalUnits(refunded, 2),
            2,
          ),
          receivedAmount: (payment.receivedAmount ?? checkout?.receivedAmount)?.toFixed(2) ?? null,
          changeAmount: (payment.changeAmount ?? checkout?.changeAmount)?.toFixed(2) ?? null,
          checkoutId: payment.checkoutId,
          operationId: payment.operationId,
          confirmedByUserId: payment.confirmedByUserId,
          createdAt: payment.createdAt.toISOString(),
        };
      });
      return {
        summary: await paymentSummary(tx, orderId),
        payments,
        nextCursor: stored.length > PAYMENT_PAGE_SIZE ? page.at(-1)!.id : null,
      };
    }),
  );
  router.get(
    '/orders/:id/payment-operations',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const orderId = idSchema.parse(req.params.id);
      const query = paymentQuerySchema.parse(req.query);
      const order = await tx.order.findUnique({ where: { id: orderId } });
      assert(order, 404, 'Comanda nu există');
      requirePaymentAccess(access, auth.user.id, order.locationId, order.total.toFixed(2));
      if (query.cursor)
        assert(
          await tx.paymentOperation.findFirst({ where: { id: query.cursor, orderId } }),
          400,
          'Cursorul nu aparține comenzii',
        );
      const stored = await tx.paymentOperation.findMany({
        where: { orderId },
        take: PAYMENT_PAGE_SIZE + 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const page = stored.slice(0, PAYMENT_PAGE_SIZE);
      return {
        operations: page.map(operationResponse),
        nextCursor: stored.length > PAYMENT_PAGE_SIZE ? page.at(-1)!.id : null,
      };
    }),
  );
}
