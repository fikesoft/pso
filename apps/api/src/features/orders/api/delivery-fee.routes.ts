import type { Router } from 'express';
import {
  idSchema,
  orderDeliveryFeePreviewSchema,
  orderDeliveryFeeCommandSchema,
  orderDeliveryFeeResolutionSchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { orderResponse } from '../../../entities/order';
import { assert } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import {
  requireDeliveryFeeOrder,
  orderDeliveryFeePreview,
} from '../model/order-delivery-fee-preview';
import {
  readOrderDeliveryFeeCommand,
  orderDeliveryFeeHash,
} from '../model/order-delivery-fee-command';
export function addOrderDeliveryFeeRoutes(router: Router) {
  router.post(
    '/orders/:id/delivery-fee/preview',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const id = idSchema.parse(req.params.id),
          body = orderDeliveryFeePreviewSchema.parse(req.body);
        const order = await requireDeliveryFeeOrder(tx, access, auth.user.id, id);
        return orderDeliveryFeePreview(tx, access, auth.user.id, order, body);
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.post(
    '/orders/:id/delivery-fee',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id),
        body = orderDeliveryFeeCommandSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const order = await requireDeliveryFeeOrder(tx, access, auth.user.id, id);
      const hash = orderDeliveryFeeHash(access.org.id, auth.user.id, id, body);
      let command = await readOrderDeliveryFeeCommand(
        tx,
        access,
        auth.user.id,
        id,
        body.requestKey,
      );
      if (command) {
        assert(
          command.status === 'SUCCEEDED' && command.requestHash === hash,
          409,
          'Tentativa a fost retrasă sau cheia aparține altor date.',
        );
      } else {
        const quote = await orderDeliveryFeePreview(tx, access, auth.user.id, order, body);
        assert(
          quote.result.status === 'AVAILABLE',
          409,
          'Livrarea nu este disponibilă pentru această destinație sau valoare.',
        );
        const rate = quote.result;
        assert(
          rate.zoneId === body.zoneId &&
            rate.zoneVersion === body.zoneVersion &&
            rate.subtotal === body.subtotal &&
            rate.fee === body.fee &&
            rate.total === body.total,
          409,
          'Tariful s-a schimbat. Recalculați și confirmați noua valoare.',
        );
        command = await tx.orderDeliveryFeeCommand.create({
          data: {
            organizationId: access.org.id,
            locationId: order.locationId,
            orderId: id,
            actorUserId: auth.user.id,
            requestKey: body.requestKey,
            requestHash: hash,
            status: 'SUCCEEDED',
            expectedVersion: body.version,
            zoneId: body.zoneId,
            zoneVersion: body.zoneVersion,
            destination: body.destination,
            subtotal: body.subtotal,
            fee: body.fee,
            total: body.total,
          },
        });
        await audit(tx, auth, req, 'orders.delivery-fee.applied', 'ORDER', id, order.locationId);
      }
      return {
        requestKey: command.requestKey,
        resultVersion: command.resultVersion,
        order: await orderResponse(tx, await tx.order.findUniqueOrThrow({ where: { id } }), true),
      };
    }),
  );
  router.post(
    '/orders/:id/delivery-fee/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id),
        body = orderDeliveryFeeResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const order = await requireDeliveryFeeOrder(tx, access, auth.user.id, id);
      let command = await readOrderDeliveryFeeCommand(
        tx,
        access,
        auth.user.id,
        id,
        body.requestKey,
      );
      if (!command) {
        command = await tx.orderDeliveryFeeCommand.create({
          data: {
            organizationId: access.org.id,
            locationId: order.locationId,
            orderId: id,
            actorUserId: auth.user.id,
            requestKey: body.requestKey,
            status: 'RETIRED',
          },
        });
        await audit(tx, auth, req, 'orders.delivery-fee.retired', 'ORDER', id, order.locationId);
      }
      return {
        status: command.status,
        requestKey: command.requestKey,
        resultVersion: command.resultVersion,
        order: await orderResponse(tx, order, true),
      };
    }),
  );
}
