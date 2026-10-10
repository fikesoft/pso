import type { Router } from 'express';
import {
  customerManagementCommandSchema,
  customerManagementResolutionSchema,
  idSchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import {
  requireCustomerManagement,
  managedCustomerResponse,
  customerCommandResult,
} from '../model/customer-management';
import { executeCustomerCommand, readCustomerCommand } from '../model/customer-command';

export function addCustomerManagementCommandRoutes(router: Router) {
  router.post(
    '/customers/:id/commands',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id);
      const body = customerManagementCommandSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      requireCustomerManagement(access, auth.user.id, body.locationId, body.action);
      const customer = await tx.customer.findFirst({
        where: { organizationId: access.org.id, id },
      });
      assert(customer, 404, 'Clientul nu există.');
      const { command, replayed } = await executeCustomerCommand(tx, customer, auth.user.id, body);
      if (!replayed)
        await audit(
          tx,
          auth,
          req,
          `customers.${body.action.toLowerCase()}`,
          'CUSTOMER',
          id,
          body.locationId,
        );
      const current = await tx.customer.findUniqueOrThrow({ where: { id } });
      return {
        status: 'SUCCEEDED',
        result: customerCommandResult(command),
        customer: managedCustomerResponse(current),
      };
    }),
  );
  router.post(
    '/customers/:id/commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const id = idSchema.parse(req.params.id);
      const body = customerManagementResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      requireCustomerManagement(access, auth.user.id, body.locationId, body.action);
      const customer = await tx.customer.findFirst({
        where: { organizationId: access.org.id, id },
      });
      assert(customer, 404, 'Clientul nu există.');
      const previous = await readCustomerCommand(tx, customer, auth.user.id, body);
      const command =
        previous ??
        (await tx.customerCommand.create({
          data: {
            organizationId: access.org.id,
            customerId: id,
            locationId: body.locationId,
            actorUserId: auth.user.id,
            requestKey: body.requestKey,
            action: body.action,
            status: 'RETIRED',
          },
        }));
      if (!previous)
        await audit(tx, auth, req, 'customers.command.retired', 'CUSTOMER', id, body.locationId);
      return {
        status: command.status,
        result: command.status === 'SUCCEEDED' ? customerCommandResult(command) : null,
        customer: managedCustomerResponse(customer),
      };
    }),
  );
}
