import type { Router } from 'express';
import {
  addressManagementCommandSchema,
  addressManagementResolutionSchema,
  idSchema,
} from '@pos/contracts';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { requireAddressAccess } from '../model/address-access';
import {
  assertAddressCommandKeyFree,
  executeAddressCommand,
  readAddressCommand,
} from '../model/address-command';
import { addressCommandResponse } from '../model/address-management';
export function addAddressManagementCommandRoutes(router: Router) {
  router.post(
    '/customers/:customerId/addresses/:id/commands',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const customerId = idSchema.parse(req.params.customerId),
        id = idSchema.parse(req.params.id);
      const body = addressManagementCommandSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const customer = await requireAddressAccess(
        tx,
        access,
        auth.user.id,
        customerId,
        body.locationId,
        true,
      );
      const address = await tx.customerAddress.findFirst({ where: { id, customerId } });
      assert(address, 404, 'Adresa nu există.');
      const { command, replayed } = await executeAddressCommand(
        tx,
        customer,
        address,
        auth.user.id,
        body,
      );
      if (!replayed)
        await audit(
          tx,
          auth,
          req,
          `customers.address.${body.action.toLowerCase()}`,
          'CUSTOMER_ADDRESS',
          id,
          body.locationId,
        );
      return addressCommandResponse(tx, command);
    }),
  );
  router.post(
    '/customers/:customerId/addresses/:id/commands/resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const customerId = idSchema.parse(req.params.customerId),
        id = idSchema.parse(req.params.id);
      const body = addressManagementResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const customer = await requireAddressAccess(
        tx,
        access,
        auth.user.id,
        customerId,
        body.locationId,
        true,
      );
      const address = await tx.customerAddress.findFirst({ where: { id, customerId } });
      assert(address, 404, 'Adresa nu există.');
      let command = await readAddressCommand(tx, address, auth.user.id, body);
      if (!command) {
        await assertAddressCommandKeyFree(tx, body.requestKey);
        command = await tx.customerAddressCommand.create({
          data: {
            organizationId: customer.organizationId,
            customerId,
            addressId: id,
            locationId: body.locationId,
            actorUserId: auth.user.id,
            requestKey: body.requestKey,
            action: body.action,
            status: 'RETIRED',
          },
        });
        await audit(
          tx,
          auth,
          req,
          'customers.address.command.retired',
          'CUSTOMER_ADDRESS',
          id,
          body.locationId,
        );
      }
      return addressCommandResponse(tx, command);
    }),
  );
}
