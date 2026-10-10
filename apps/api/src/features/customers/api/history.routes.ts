import type { Router } from 'express';
import { customerHistoryQuerySchema, idSchema } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { readCustomerHistory } from '../model/customer-history';

export function addCustomerHistoryRoutes(router: Router) {
  router.get(
    '/customers/:id/orders',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        return readCustomerHistory(
          tx,
          access,
          auth.user.id,
          idSchema.parse(req.params.id),
          customerHistoryQuerySchema.parse(req.query),
        );
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
