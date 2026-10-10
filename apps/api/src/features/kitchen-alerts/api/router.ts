import { Router } from 'express';
import {
  kitchenAlertIdentitySchema,
  kitchenAlertSetSchema,
  kitchenAlertCommandIdentitySchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { requireAlertAccess, requireAlertTarget } from '../model/alert-access';
import { addAlertOptionsRoutes } from './options.routes';
import {
  currentAlert,
  setAlert,
  readAlertCommand,
  resolveAlertCommand,
  alertResponse,
} from '../model/alert-command';

export function kitchenAlertsRouter() {
  const router = Router();
  addAlertOptionsRoutes(router);
  router.post(
    '/kitchen-alerts/read',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const identity = kitchenAlertIdentitySchema.parse(req.body);
        requireAlertAccess(access, auth.user.id, identity);
        await requireAlertTarget(tx, access.org.id, identity);
        return { rule: await currentAlert(tx, access.org.id, identity) };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.put(
    '/kitchen-alerts',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = kitchenAlertSetSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      requireAlertAccess(access, auth.user.id, body);
      const previous = await readAlertCommand(tx, access.org.id, auth.user.id, body);
      if (!previous) await requireAlertTarget(tx, access.org.id, body, body.thresholds !== null);
      const result = await setAlert(tx, access.org.id, auth.user.id, body);
      if (!result.replayed)
        await audit(
          tx,
          auth,
          req,
          'kitchen.alerts.updated',
          'KITCHEN_ALERT_RULE',
          body.target.kind === 'PRODUCT'
            ? body.target.productId
            : body.target.kind === 'CATEGORY'
              ? body.target.categoryId
              : body.target.kind === 'STATION'
                ? body.target.stationId
                : access.org.id,
          body.scope.scopeType === 'LOCATION' ? body.scope.locationId : null,
        );
      return { rule: result.rule };
    }),
  );
  router.post(
    '/kitchen-alert-commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const command = kitchenAlertCommandIdentitySchema.parse(req.body);
      requireAlertAccess(access, auth.user.id, command);
      await requireAlertTarget(tx, access.org.id, command);
      const row = await resolveAlertCommand(tx, access.org.id, auth.user.id, command);
      return row.status === 'SUCCEEDED'
        ? { status: 'SUCCEEDED', command, result: { rule: alertResponse(row) } }
        : { status: 'RETIRED', command };
    }),
  );
  return router;
}
