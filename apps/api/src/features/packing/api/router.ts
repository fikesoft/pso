import { Router } from 'express';
import { idSchema, packingCommandSchema, resolvePackingCommandSchema } from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { packingCommandPermission, requirePackingPermission } from '../model/packing-authorization';
import {
  executePackingCommand,
  packingCommandResult,
  readPackingCommand,
} from '../model/packing-command';
import { addPackingReadRoutes } from './read.routes';

export function packingRouter() {
  const router = Router();
  addPackingReadRoutes(router);
  router.post(
    '/packing/sessions/:id/commands',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id);
      const body = packingCommandSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const session = await tx.packingSession.findFirst({
        where: { organizationId: access.org.id, id },
      });
      assert(session, 404, 'Sesiunea nu există.');
      requirePackingPermission(
        access,
        auth.user.id,
        session.locationId,
        packingCommandPermission(body.action),
      );
      const { result, replayed } = await executePackingCommand(tx, session, auth.user.id, body);
      if (!replayed)
        await audit(
          tx,
          auth,
          req,
          `packing.${body.action.toLowerCase()}`,
          'PACKING_SESSION',
          session.id,
          session.locationId,
        );
      return { result };
    }),
  );
  router.post(
    '/packing/commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const command = resolvePackingCommandSchema.parse(req.body);
      const session = await tx.packingSession.findFirst({
        where: { organizationId: access.org.id, id: command.sessionId },
      });
      assert(session, 404, 'Sesiunea nu există.');
      requirePackingPermission(
        access,
        auth.user.id,
        session.locationId,
        packingCommandPermission(command.action),
      );
      const previous = await readPackingCommand(tx, session, auth.user.id, command);
      const row =
        previous ??
        (await tx.packingCommand.create({
          data: {
            organizationId: access.org.id,
            locationId: session.locationId,
            sessionId: session.id,
            actorUserId: auth.user.id,
            requestKey: command.requestKey,
            action: command.action,
            status: 'RETIRED',
          },
        }));
      if (!previous)
        await audit(
          tx,
          auth,
          req,
          'packing.retired',
          'PACKING_SESSION',
          session.id,
          session.locationId,
        );
      return row.status === 'SUCCEEDED'
        ? { status: 'SUCCEEDED', command, result: packingCommandResult(row) }
        : { status: 'RETIRED', command };
    }),
  );
  return router;
}
