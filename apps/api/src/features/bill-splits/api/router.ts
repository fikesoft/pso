import { listBills } from '../model/list-bills';
import { addBillPlanResolutionRoute } from './resolution.routes';
import { voidBill } from '../model/void-bill';
import { Router } from 'express';
import {
  billSplitCreateSchema,
  billSplitListSchema,
  billSplitVoidSchema,
  billSplitPreviewSchema,
  billSplitReadSchema,
  idSchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { previewBill } from '../model/bill-sources';
import { createBill } from '../model/create-bill';
import { readBill } from '../model/bill-response';
export function billSplitsRouter() {
  const router = Router();
  addBillPlanResolutionRoute(router);
  router.post(
    '/bill-splits/preview',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        return {
          preview: await previewBill(
            tx,
            access,
            auth.user.id,
            billSplitPreviewSchema.parse(req.body),
          ),
        };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.post(
    '/bill-splits',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = billSplitCreateSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await createBill(tx, access, auth.user.id, body);
      if (!result.replayed)
        await audit(
          tx,
          auth,
          req,
          'bill.split.created',
          'BILL_SPLIT',
          result.split.id,
          body.locationId,
        );
      return { split: result.split };
    }),
  );
  router.get(
    '/bill-splits/:id',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const { locationId } = billSplitReadSchema.parse(req.query);
        return {
          split: await readBill(
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
    '/bill-splits/:id/void',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = billSplitVoidSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await voidBill(tx, access, auth.user.id, idSchema.parse(req.params.id), body);
      if (!result.replayed)
        await audit(
          tx,
          auth,
          req,
          'bill.split.voided',
          'BILL_SPLIT',
          result.split.id,
          body.locationId,
        );
      return { split: result.split };
    }),
  );
  router.get(
    '/bill-splits',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        return listBills(tx, access, auth.user.id, billSplitListSchema.parse(req.query));
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  return router;
}
