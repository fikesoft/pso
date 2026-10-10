import type { Router } from 'express';
import { diningTableResolutionSchema } from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { resolveTable } from '../model/table-resolution';
export function addTableResolutionRoute(router: Router) {
  router.post(
    '/dining-table-commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = diningTableResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await resolveTable(tx, access, auth.user.id, body);
      await audit(
        tx,
        auth,
        req,
        'table.command.resolved',
        'DINING_TABLE_COMMAND',
        body.requestKey,
        body.locationId,
      );
      return result;
    }),
  );
}
