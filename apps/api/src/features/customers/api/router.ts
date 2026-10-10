import { addCustomerAnalyticsRoutes } from './analytics.routes';
import { addCustomerHistoryRoutes } from './history.routes';
import { randomUUID } from 'node:crypto';
import { addCustomerManagementReadRoutes } from './management-read.routes';
import { addCustomerManagementCommandRoutes } from './management-command.routes';
import { Router } from 'express';
import { createCustomerSchema, customerLookupSchema, CUSTOMER_PHONE_EXISTS } from '@pos/contracts';
import {
  customerProfileColumns,
  customerRegistrationHash,
  customerResponse,
  requireCustomerAccess,
} from '../../../entities/customer';
import { audit, endpoint, visibleLocations } from '../../../entities/tenant-access';
import { customerLookupHash } from '../../../shared/lib/customer-identity';
import { assert, HttpError } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';

export function customersRouter() {
  const router = Router();
  addCustomerHistoryRoutes(router);
  addCustomerAnalyticsRoutes(router);
  addCustomerManagementReadRoutes(router);
  addCustomerManagementCommandRoutes(router);
  router.post(
    '/customers/lookup',
    endpoint(
      async (tx, access, auth, req, res) => {
        res.set('Cache-Control', 'no-store');
        const body = customerLookupSchema.parse(req.body);
        requireCustomerAccess({
          organizationId: access.org.id,
          locationId: body.locationId,
          visibleLocationIds: visibleLocations(access, auth.user.id).map((location) => location.id),
          canUse: (permission, scope) => access.service.canUse(auth.user.id, permission, scope),
        });
        const customer = await tx.customer.findFirst({
          where: {
            phoneLookupHash: customerLookupHash(access.org.id, 'phone', body.phone)!,
            status: 'ACTIVE',
          },
        });
        return { customer: customer ? customerResponse(customer) : null };
      },
      { readOnly: true },
    ),
  );
  router.post(
    '/customers',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const body = createCustomerSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      requireCustomerAccess(
        {
          organizationId: access.org.id,
          locationId: body.locationId,
          visibleLocationIds: visibleLocations(access, auth.user.id).map((location) => location.id),
          canUse: (permission, scope) => access.service.canUse(auth.user.id, permission, scope),
        },
        true,
      );
      const hash = customerRegistrationHash(access.org.id, auth.user.id, body);
      const previous = await tx.customer.findFirst({
        where: { creationRequestKey: body.requestKey },
      });
      if (previous) {
        assert(
          previous.creationRequestHash === hash,
          409,
          'Cheia cererii a fost folosită pentru alte date',
        );
        return { customer: customerResponse(previous) };
      }
      const duplicate = await tx.customer.findFirst({
        where: { phoneLookupHash: customerLookupHash(access.org.id, 'phone', body.phone)! },
      });
      if (duplicate)
        throw new HttpError(
          409,
          'Există deja un profil pentru acest telefon. Căutați și selectați profilul.',
          CUSTOMER_PHONE_EXISTS,
        );
      const id = randomUUID();
      const customer = await tx.customer.create({
        data: {
          id,
          organizationId: access.org.id,
          createdLocationId: body.locationId,
          createdByUserId: auth.user.id,
          ...customerProfileColumns(access.org.id, id, body),
          creationRequestKey: body.requestKey,
          creationRequestHash: hash,
        },
      });
      await audit(tx, auth, req, 'customers.created', 'CUSTOMER', id, body.locationId);
      return { customer: customerResponse(customer) };
    }),
  );
  return router;
}
