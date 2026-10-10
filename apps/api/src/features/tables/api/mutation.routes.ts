import type { Router } from 'express';
import {
  diningTableCreateSchema,
  diningTableUpdateSchema,
  diningTableArchiveSchema,
  idSchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import type { TenantHandler } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { mutateTable } from '../model/table-mutation';
import { TABLE_AUDIT_ACTIONS } from '../config/table.constants';
import type { TableMutation } from '../model/table-command.types';
function mutationHandler(kind: TableMutation['kind']): TenantHandler {
  return async (tx, access, auth, req, res) => {
    res.set('Cache-Control', 'no-store');
    const command: TableMutation =
      kind === 'CREATE'
        ? { kind, body: diningTableCreateSchema.parse(req.body) }
        : kind === 'UPDATE'
          ? {
              kind,
              tableId: idSchema.parse(req.params.id),
              body: diningTableUpdateSchema.parse(req.body),
            }
          : {
              kind,
              tableId: idSchema.parse(req.params.id),
              body: diningTableArchiveSchema.parse(req.body),
            };
    validateIdempotencyHeader(req.headers['idempotency-key'], command.body.requestKey);
    const result = await mutateTable(tx, access, auth.user.id, command);
    if (!result.replayed)
      await audit(
        tx,
        auth,
        req,
        TABLE_AUDIT_ACTIONS[kind],
        'DINING_TABLE',
        result.table.id,
        result.table.locationId,
      );
    return { table: result.table };
  };
}
export function addTableMutationRoutes(router: Router) {
  router.post('/dining-tables', endpoint(mutationHandler('CREATE')));
  router.patch('/dining-tables/:id', endpoint(mutationHandler('UPDATE')));
  router.post('/dining-tables/:id/archive', endpoint(mutationHandler('ARCHIVE')));
}
