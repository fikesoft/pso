import { addBillCollectionRoutes } from './bill-collection.routes';
import { addPaymentResolutionRoute } from './resolution.routes';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { Router } from 'express';
import { collectPaymentSchema, idSchema, refundPaymentSchema } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { executePayment } from '../model/execute-payment';
import { addPaymentReadRoutes } from './read.routes';

export function paymentsRouter() {
  const router = Router();
  addPaymentResolutionRoute(router);
  addBillCollectionRoutes(router);
  router.post(
    '/orders/:id/payments',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = collectPaymentSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      body.payments.sort((a, b) => a.method.localeCompare(b.method));
      return executePayment(tx, access, auth, req, idSchema.parse(req.params.id), {
        kind: 'COLLECT',
        body,
      });
    }),
  );
  router.post(
    '/orders/:id/refunds',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = refundPaymentSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      body.refunds.sort((a, b) => a.paymentId.localeCompare(b.paymentId));
      return executePayment(tx, access, auth, req, idSchema.parse(req.params.id), {
        kind: 'REFUND',
        body,
      });
    }),
  );
  addPaymentReadRoutes(router);
  return router;
}
