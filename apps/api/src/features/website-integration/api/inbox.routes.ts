import {
  acceptWebsiteOrderSchema,
  idSchema,
  rejectWebsiteOrderSchema,
  websiteInboxQuerySchema,
} from '@pos/contracts';
import type { Router } from 'express';
import { endpoint } from '../../../entities/tenant-access';
import { websiteOrderResponse } from '../../../entities/website-order';
import { assert } from '../../../shared/lib/http';
import { decideWebsiteOrder } from '../model/decide-order';
import { listWebsiteInbox } from '../model/list-inbox';
import { requireWebsiteOrderAccess } from '../model/website-authorization';

export function addWebsiteInboxRoutes(router: Router) {
  router.get(
    '/website/orders',
    endpoint(async (tx, access, auth, req) => {
      const query = websiteInboxQuerySchema.parse(req.query);
      requireWebsiteOrderAccess(access, auth.user.id, query.locationId);
      return listWebsiteInbox(tx, access, auth.user.id, query);
    }),
  );
  router.get(
    '/website/orders/:id',
    endpoint(async (tx, access, auth, req) => {
      const order = await tx.websiteOrder.findUnique({
        where: { id: idSchema.parse(req.params.id) },
      });
      assert(order, 404, 'Comanda website nu există');
      requireWebsiteOrderAccess(access, auth.user.id, order.locationId, order.total.toFixed(2));
      return { websiteOrder: await websiteOrderResponse(tx, order) };
    }),
  );
  router.post(
    '/website/orders/:id/accept',
    endpoint(async (tx, access, auth, req) => {
      const body = acceptWebsiteOrderSchema.parse(req.body);
      return decideWebsiteOrder(tx, access, auth, req, idSchema.parse(req.params.id), body.version);
    }),
  );
  router.post(
    '/website/orders/:id/reject',
    endpoint(async (tx, access, auth, req) => {
      const body = rejectWebsiteOrderSchema.parse(req.body);
      return decideWebsiteOrder(
        tx,
        access,
        auth,
        req,
        idSchema.parse(req.params.id),
        body.version,
        body.reason,
      );
    }),
  );
}
