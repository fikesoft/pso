import type { Router } from 'express';
import {
  billCollectionSchema,
  billCollectionIdentitySchema,
  billSplitReadSchema,
  idSchema,
} from '@pos/contracts';
import { endpoint, audit } from '../../../entities/tenant-access';
import { requireShiftRead } from '../../../entities/cash-shift';
import { assert } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { collectBillPart } from '../model/collect-bill-part';
import { billPaymentPreview, requireBillCollectionAmount } from '../model/bill-payment-access';
import { billCollectionResponse } from '../model/bill-collection-response';
export function addBillCollectionRoutes(router: Router) {
  router.get(
    '/bill-parts/:id/payment-preview',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const { locationId } = billSplitReadSchema.parse(req.query);
        return {
          preview: await billPaymentPreview(
            tx,
            access,
            auth.user.id,
            locationId,
            idSchema.parse(req.params.id),
          ),
        };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.post(
    '/bill-parts/:id/payments',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = billCollectionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      return {
        collection: await collectBillPart(
          tx,
          access,
          auth,
          req,
          idSchema.parse(req.params.id),
          body,
        ),
      };
    }),
  );
  router.post(
    '/bill-parts/:id/payment-commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = billCollectionIdentitySchema.parse(req.body),
        partId = idSchema.parse(req.params.id);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const preview = await billPaymentPreview(
        tx,
        access,
        auth.user.id,
        body.locationId,
        partId,
        true,
      );
      requireShiftRead(access.service, access.org.id, auth.user.id, body.locationId);
      for (const source of preview.sources)
        await tx.$executeRaw`SELECT public.prepare_bill_order(${access.org.id}::uuid,${body.locationId}::uuid,${source.orderId}::uuid)`;
      const previous = await tx.billCollection.findFirst({
        where: { locationId: body.locationId, requestKey: body.requestKey },
      });
      const command = { ...body, partId };
      if (previous) {
        assert(
          previous.partId === partId && previous.actorUserId === auth.user.id,
          409,
          'Cheia aparține altei operațiuni sau altui operator.',
        );
        if (previous.status === 'SUCCEEDED') {
          requireBillCollectionAmount(
            access,
            auth.user.id,
            body.locationId,
            previous.amount!.toFixed(2),
          );
          return {
            status: 'SUCCEEDED',
            command,
            result: { collection: await billCollectionResponse(tx, previous.id) },
          };
        }
      } else {
        await tx.billCollection.create({
          data: {
            organizationId: access.org.id,
            actorUserId: auth.user.id,
            ...body,
            partId,
            status: 'RETIRED',
          },
        });
        await audit(
          tx,
          auth,
          req,
          'bill.collection.retired',
          'BILL_COLLECTION',
          body.requestKey,
          body.locationId,
        );
      }
      return { status: 'RETIRED', command };
    }),
  );
}
