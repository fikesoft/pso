import type { Router } from 'express';
import {
  cashRegisterCreateSchema,
  cashRegisterRenameSchema,
  cashRegisterArchiveSchema,
  idSchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import type { TenantHandler } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { mutateRegister } from '../model/register-mutation';
import { REGISTER_AUDIT_ACTIONS } from '../config/register.constants';
import type { RegisterMutation } from '../model/register-command.types';
function mutationHandler(kind: RegisterMutation['kind']): TenantHandler {
  return async (tx, access, auth, req, res) => {
    res.set('Cache-Control', 'no-store');
    const command: RegisterMutation =
      kind === 'CREATE'
        ? { kind, body: cashRegisterCreateSchema.parse(req.body) }
        : kind === 'RENAME'
          ? {
              kind,
              registerId: idSchema.parse(req.params.id),
              body: cashRegisterRenameSchema.parse(req.body),
            }
          : {
              kind,
              registerId: idSchema.parse(req.params.id),
              body: cashRegisterArchiveSchema.parse(req.body),
            };
    validateIdempotencyHeader(req.headers['idempotency-key'], command.body.requestKey);
    const result = await mutateRegister(tx, access, auth.user.id, command);
    if (!result.replayed)
      await audit(
        tx,
        auth,
        req,
        REGISTER_AUDIT_ACTIONS[kind],
        'CASH_REGISTER',
        result.register.id,
        result.register.locationId,
      );
    return { register: result.register };
  };
}
export function addRegisterMutationRoutes(router: Router) {
  router.post('/cash-registers', endpoint(mutationHandler('CREATE')));
  router.patch('/cash-registers/:id', endpoint(mutationHandler('RENAME')));
  router.post('/cash-registers/:id/archive', endpoint(mutationHandler('ARCHIVE')));
}
