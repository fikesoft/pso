import { addCheckoutResolutionRoute } from './resolution.routes';
import { demoCheckoutSchema, idSchema, manualCheckoutSchema } from '@pos/contracts';
import { Router } from 'express';
import { receiptResponse } from '../../../entities/order';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireCheckoutAccess } from '../model/checkout-authorization';
import { finalizeCheckout } from '../model/finalize-checkout';

export function checkoutRouter() {
  const router = Router();
  addCheckoutResolutionRoute(router);
  router.use('/orders/:id/checkout', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.post(
    '/orders/:id/checkout/demo',
    endpoint(async (tx, access, auth, req) =>
      finalizeCheckout(tx, access, auth, req, idSchema.parse(req.params.id), {
        mode: 'DEMO',
        body: demoCheckoutSchema.parse(req.body),
      }),
    ),
  );
  router.post(
    '/orders/:id/checkout/manual',
    endpoint(async (tx, access, auth, req) =>
      finalizeCheckout(tx, access, auth, req, idSchema.parse(req.params.id), {
        mode: 'MANUAL',
        body: manualCheckoutSchema.parse(req.body),
      }),
    ),
  );
  router.get(
    '/orders/:id/receipt',
    endpoint(async (tx, access, auth, req) => {
      const orderId = idSchema.parse(req.params.id);
      const order = await tx.order.findUnique({ where: { id: orderId } });
      assert(order, 404, 'Comanda nu există');
      requireCheckoutAccess(access, auth.user.id, order);
      const checkout = await tx.checkout.findFirst({ where: { orderId } });
      assert(checkout, 404, 'Comanda nu are încă un bon');
      return { receipt: await receiptResponse(tx, checkout) };
    }),
  );
  return router;
}
