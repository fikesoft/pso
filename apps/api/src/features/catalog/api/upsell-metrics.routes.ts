import type { Router } from 'express';
import type { UpsellRuleMetrics } from '@pos/contracts';
import { upsellMetricsQuerySchema } from '@pos/contracts';
import { Prisma } from '@pos/db';
import { endpoint, scopeFor } from '../../../entities/tenant-access';
import { requireUpsellAccess } from '../model/upsell-policy';

export function addUpsellMetricsRoutes(router: Router) {
  router.get(
    '/catalog/upsell-metrics',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const query = upsellMetricsQuerySchema.parse(req.query);
      requireUpsellAccess(access, auth.user.id, query.locationId);
      const canReadRevenue = access.service.canUse(
        auth.user.id,
        'reports.sales.read',
        scopeFor(access.org.id, { scopeType: 'LOCATION', locationId: query.locationId }),
      );
      // Allocate net collected cents by cumulative line position; remainders never create money.
      const metrics = await tx.$queryRaw<UpsellRuleMetrics[]>(Prisma.sql`
      SELECT r.id AS "ruleId", count(f.id)::text AS shown,
        count(f."acceptedAt")::text AS accepted,
        CASE WHEN count(f.id)=0 THEN '0.00' ELSE
          round(100.0*count(f."acceptedAt")/count(f.id),2)::text END AS "conversionPercent",
        CASE WHEN ${canReadRevenue} THEN round(coalesce(sum(CASE WHEN o.status='COMPLETED' AND o.total>0
          AND (c.mode IS NULL OR c.mode='MANUAL')
          THEN (div(100*(preceding.amount+i."lineTotal")*financial.net,o.total)
            -div(100*preceding.amount*financial.net,o.total))/100 ELSE 0 END),0),2)::text ELSE NULL END AS revenue
      FROM public."UpsellRule" r
      LEFT JOIN public."UpsellOffer" f ON f."organizationId"=r."organizationId" AND f."locationId"=r."locationId"
        AND f."ruleId"=r.id AND f."shownAt">=${new Date(query.from)} AND f."shownAt"<${new Date(query.to)}
      LEFT JOIN public."OrderItem" i ON i."organizationId"=f."organizationId" AND i."locationId"=f."locationId"
        AND i.id=f."claimedItemId" AND i."sourceUpsellOfferId"=f.id
      LEFT JOIN public."Order" o ON o."organizationId"=i."organizationId" AND o."locationId"=i."locationId" AND o.id=i."orderId"
      LEFT JOIN public."Checkout" c ON c."organizationId"=o."organizationId" AND c."locationId"=o."locationId" AND c."orderId"=o.id
      LEFT JOIN LATERAL (SELECT public.order_net_paid(o."organizationId",o.id) AS net) financial ON true
      LEFT JOIN LATERAL (SELECT coalesce(sum(prior."lineTotal"),0) AS amount FROM public."OrderItem" prior
        WHERE prior."organizationId"=i."organizationId" AND prior."orderId"=i."orderId" AND prior.position<i.position) preceding ON true
      WHERE r."organizationId"=${access.org.id}::uuid AND r."locationId"=${query.locationId}::uuid
        AND r.id IN (${Prisma.join(query.ruleIds.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY r.id ORDER BY r.id`);
      return { metrics, currency: 'MDL' };
    }),
  );
}
