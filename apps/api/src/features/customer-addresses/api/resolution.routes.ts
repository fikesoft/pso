import type { Router } from 'express';
import { customerAddressCreationResolutionSchema, idSchema } from '@pos/contracts';
import { customerAddressResponse } from '../../../entities/customer-address';
import { audit, endpoint } from '../../../entities/tenant-access';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { requireAddressAccess } from '../model/address-access';
import { readAddressClaim } from '../model/address-claim';
export function addAddressResolutionRoute(router: Router) {
  router.post(
    '/customers/:customerId/addresses/creation-resolution',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const customerId = idSchema.parse(req.params.customerId),
        body = customerAddressCreationResolutionSchema.parse(req.body);
      validateIdempotencyHeader(req.headers['idempotency-key'], body.requestKey);
      await requireAddressAccess(tx, access, auth.user.id, customerId, body.locationId, true);
      const claim = await readAddressClaim(
        tx,
        customerId,
        body.locationId,
        body.requestKey,
        auth.user.id,
      );
      if (claim?.status === 'CREATED') {
        const address = await tx.customerAddress.findUniqueOrThrow({
          where: { id: claim.addressId! },
        });
        return { status: 'CREATED', address: customerAddressResponse(address) };
      }
      if (!claim) {
        const retired = await tx.customerAddressCreationClaim.create({
          data: {
            organizationId: access.org.id,
            customerId,
            locationId: body.locationId,
            requestKey: body.requestKey,
            actorUserId: auth.user.id,
            status: 'RETIRED',
          },
        });
        await audit(
          tx,
          auth,
          req,
          'customers.address.creation.retired',
          'CUSTOMER_ADDRESS_CREATION_CLAIM',
          retired.id,
          body.locationId,
        );
      }
      return {
        status: 'RETIRED',
        customerId,
        locationId: body.locationId,
        requestKey: body.requestKey,
      };
    }),
  );
}
