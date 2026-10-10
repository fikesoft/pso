import type { Router } from 'express';
import {
  customerManagementListSchema,
  customerManagementSearchSchema,
  idSchema,
} from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireCustomerManagement, managedCustomerResponse } from '../model/customer-management';
import { listManagedCustomers } from '../model/customer-list';

export function addCustomerManagementReadRoutes(router: Router) {
  router.get(
    '/customers',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const query = customerManagementListSchema.parse(req.query);
        requireCustomerManagement(access, auth.user.id, query.locationId);
        return listManagedCustomers(tx, access.org.id, auth.user.id, query);
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.post(
    '/customers/search',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const body = customerManagementSearchSchema.parse(req.body);
        requireCustomerManagement(access, auth.user.id, body.locationId);
        return listManagedCustomers(tx, access.org.id, auth.user.id, body, body);
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
  router.get(
    '/customers/:id',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const id = idSchema.parse(req.params.id);
        const { locationId } = customerManagementListSchema
          .pick({ locationId: true })
          .parse(req.query);
        requireCustomerManagement(access, auth.user.id, locationId);
        const customer = await tx.customer.findFirst({
          where: { organizationId: access.org.id, id },
        });
        assert(customer, 404, 'Clientul nu există.');
        return { customer: managedCustomerResponse(customer) };
      },
      { readOnly: true, readOnlySnapshot: true },
    ),
  );
}
