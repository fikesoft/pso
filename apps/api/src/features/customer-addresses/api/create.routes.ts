import { randomUUID } from 'node:crypto';
import type { Router } from 'express';
import { customerAddressCreateSchema, idSchema } from '@pos/contracts';
import {
  addressCreationHash,
  addressProfileColumns,
  customerAddressResponse,
} from '../../../entities/customer-address';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { requireAddressAccess } from '../model/address-access';
import { readAddressClaim, rejectRetiredAddress } from '../model/address-claim';
export function addAddressCreateRoute(router: Router) {
  router.post(
    '/customers/:customerId/addresses',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const customerId = idSchema.parse(req.params.customerId);
      const body = customerAddressCreateSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      const customer = await requireAddressAccess(
        tx,
        access,
        auth.user.id,
        customerId,
        body.locationId,
        true,
      );
      const claim = await readAddressClaim(
        tx,
        customerId,
        body.locationId,
        body.requestKey,
        auth.user.id,
      );
      if (claim?.status === 'RETIRED') rejectRetiredAddress();
      const hash = addressCreationHash(access.org.id, customerId, auth.user.id, body);
      if (claim) {
        assert(claim.requestHash === hash, 409, 'Cheia cererii a fost folosită pentru alte date');
        const address = await tx.customerAddress.findUniqueOrThrow({
          where: { id: claim.addressId! },
        });
        return { address: customerAddressResponse(address) };
      }
      assert(customer.status === 'ACTIVE', 409, 'Clientul este arhivat.');
      const id = randomUUID();
      const address = await tx.customerAddress.create({
        data: {
          id,
          organizationId: access.org.id,
          customerId,
          createdLocationId: body.locationId,
          createdByUserId: auth.user.id,
          ...addressProfileColumns(access.org.id, customerId, id, body),
          creationRequestKey: body.requestKey,
          creationRequestHash: hash,
        },
      });
      await audit(
        tx,
        auth,
        req,
        'customers.address.created',
        'CUSTOMER_ADDRESS',
        id,
        body.locationId,
      );
      return { address: customerAddressResponse(address) };
    }),
  );
}
