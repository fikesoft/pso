import type { Router } from 'express';
import {
  idSchema,
  tableVisitOpenSchema,
  tableVisitCommandSchema,
  tableVisitResolutionSchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { openVisit, mutateVisit } from '../model/visit-mutation';
import { resolveVisit } from '../model/visit-command';
export function addVisitMutationRoutes(router: Router) {
  router.post(
    '/dining-tables/:id/visits',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = tableVisitOpenSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await openVisit(tx, access, auth.user.id, idSchema.parse(req.params.id), body);
      if (!result.replayed)
        await audit(
          tx,
          auth,
          req,
          'table.visit.opened',
          'TABLE_VISIT',
          result.event.visitId,
          body.locationId,
        );
      return { event: result.event };
    }),
  );
  router.post(
    '/table-visits/:id/commands',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = tableVisitCommandSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await mutateVisit(
        tx,
        access,
        auth.user.id,
        idSchema.parse(req.params.id),
        body,
      );
      if (!result.replayed)
        await audit(
          tx,
          auth,
          req,
          'table.visit.changed',
          'TABLE_VISIT',
          result.event.visitId,
          body.locationId,
          { kind: body.kind },
        );
      return { event: result.event };
    }),
  );
  router.post(
    '/table-visit-commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = tableVisitResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const result = await resolveVisit(tx, access, auth.user.id, body);
      await audit(
        tx,
        auth,
        req,
        'table.visit.resolved',
        'TABLE_VISIT_COMMAND',
        body.requestKey,
        body.locationId,
      );
      return result;
    }),
  );
}
