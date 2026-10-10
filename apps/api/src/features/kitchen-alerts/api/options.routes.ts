import type { Router } from 'express';
import { kitchenAlertOptionsSchema, kitchenAlertIdentitySchema } from '@pos/contracts';
import type { KitchenAlertOptionsResponse } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { requireAlertAccess, requireAlertTarget } from '../model/alert-access';
import { previewAlert } from '../model/alert-preview';

export function addAlertOptionsRoutes(router: Router) {
  router.post(
    '/kitchen-alerts/preview',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const identity = kitchenAlertIdentitySchema.parse(req.body);
        requireAlertAccess(access, auth.user.id, identity);
        await requireAlertTarget(tx, access.org.id, identity);
        return previewAlert(tx, access.org.id, identity);
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.post(
    '/kitchen-alerts/options',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = kitchenAlertOptionsSchema.parse(req.body);
        requireAlertAccess(access, auth.user.id, {
          scope: query.scope,
          target: { kind: 'DEFAULT' },
        });
        const locationId = query.scope.scopeType === 'LOCATION' ? query.scope.locationId : null;
        const rows = await tx.$queryRaw<KitchenAlertOptionsResponse['options']>`
      SELECT id,name,code FROM (
        SELECT id,name,code FROM "KitchenStation" WHERE ${query.kind}='STATION'
          AND "organizationId"=${access.org.id}::uuid AND "locationId"=${locationId}::uuid AND status='ACTIVE'
        UNION ALL
        SELECT id,name,NULL::text AS code FROM "Category" WHERE ${query.kind}='CATEGORY'
          AND "organizationId"=${access.org.id}::uuid AND status='ACTIVE'
        UNION ALL
        SELECT p.id,p.name,p.sku AS code FROM "Product" p WHERE ${query.kind}='PRODUCT'
          AND p."organizationId"=${access.org.id}::uuid AND p.status='ACTIVE'
          AND (${locationId}::uuid IS NULL OR EXISTS(SELECT 1 FROM "LocationProduct" lp
            WHERE lp."organizationId"=p."organizationId" AND lp."productId"=p.id AND lp."locationId"=${locationId}::uuid))
      ) options WHERE (${query.cursor ?? null}::uuid IS NULL OR id>${query.cursor ?? null}::uuid)
        AND (${query.search}::text='' OR strpos(lower(name),lower(${query.search}))>0
          OR strpos(lower(coalesce(code,'')),lower(${query.search}))>0)
      ORDER BY id LIMIT ${query.limit + 1}`;
        const options = rows.slice(0, query.limit);
        return { options, nextCursor: rows.length > query.limit ? options.at(-1)!.id : null };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
