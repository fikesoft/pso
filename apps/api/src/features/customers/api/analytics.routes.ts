import type { Router } from 'express';
import {
  customerAnalyticsQuerySchema,
  customerAnalyticsResponseSchema,
  idSchema,
} from '@pos/contracts';
import { endpoint, scopeFor, visibleLocations } from '../../../entities/tenant-access';
import { readCustomerAnalytics, calculateCustomerRfm } from '../../../entities/customer';
import { assert } from '../../../shared/lib/http';

export function addCustomerAnalyticsRoutes(router: Router) {
  router.get(
    '/customers/:id/analytics',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const customerId = idSchema.parse(req.params.id);
        const scope = customerAnalyticsQuerySchema.parse(req.query);
        const organizationScope = scopeFor(access.org.id, {});
        assert(access.service.canUse(auth.user.id, 'customers.read', organizationScope));
        assert(access.service.canUse(auth.user.id, 'customers.analytics.read', organizationScope));
        const localScope = (locationId: string) =>
          scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
        const locations = visibleLocations(access, auth.user.id).filter(
          (location) =>
            (scope.scopeType === 'ORGANIZATION' || location.id === scope.locationId) &&
            access.service.canUse(auth.user.id, 'orders.read', localScope(location.id)),
        );
        assert(locations.length > 0);
        assert(
          await tx.customer.findFirst({ where: { id: customerId, organizationId: access.org.id } }),
          404,
          'Clientul nu există.',
        );
        const coverage = locations
          .map(({ id, name }) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ro') || a.id.localeCompare(b.id));
        const result = await readCustomerAnalytics(tx, {
          organizationId: access.org.id,
          customerId,
          locations: coverage,
          canRead: (locationId, amount) =>
            access.service.canUse(auth.user.id, 'orders.read', {
              ...localScope(locationId),
              amount,
            }),
        });
        return customerAnalyticsResponseSchema.parse({
          customerId,
          timezone: access.org.timezone,
          scope,
          locations: coverage,
          ...result,
          rfm: calculateCustomerRfm(result.metrics, result.asOf),
        });
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
