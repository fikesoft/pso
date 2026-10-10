import { Router } from 'express';
import { cashDiscrepancyQuerySchema, cashDiscrepancyRegisterQuerySchema } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { requireDiscrepancyAccess } from '../model/discrepancy-access';
import { discrepancyPage } from '../model/discrepancy-page';
import { discrepancyRegisters } from '../model/discrepancy-registers';
export function cashDiscrepanciesRouter() {
  const router = Router();
  router.use(
    ['/cash-shifts/discrepancies', '/cash-shifts/discrepancy-registers'],
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    },
  );
  router.get(
    '/cash-shifts/discrepancies',
    endpoint(
      async (tx, access, auth, req) => {
        const query = cashDiscrepancyQuerySchema.parse(req.query);
        const timezone = requireDiscrepancyAccess(access, auth.user.id, query.locationId);
        return discrepancyPage(tx, {
          ...query,
          organizationId: access.org.id,
          actor: auth.user.id,
          timezone,
        });
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/cash-shifts/discrepancy-registers',
    endpoint(
      async (tx, access, auth, req) => {
        const query = cashDiscrepancyRegisterQuerySchema.parse(req.query);
        const timezone = requireDiscrepancyAccess(access, auth.user.id, query.locationId);
        return discrepancyRegisters(tx, {
          ...query,
          organizationId: access.org.id,
          actor: auth.user.id,
          timezone,
        });
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  return router;
}
