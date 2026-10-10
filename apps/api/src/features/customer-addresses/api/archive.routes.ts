import { executeAddressCommand } from '../model/address-command';
import type { Router } from 'express';
import { customerAddressArchiveSchema, idSchema } from '@pos/contracts';
import { addressArchiveHash, customerAddressResponse } from '../../../entities/customer-address';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { validateIdempotencyHeader } from '../../../shared/lib/idempotency-header';
import { requireAddressAccess } from '../model/address-access';
export function addAddressArchiveRoute(router: Router) {
  router.post(
    '/customers/:customerId/addresses/:id/archive',
    endpoint(async (tx, access, auth, req, res) => {
      res.set('Cache-Control', 'no-store');
      const customerId = idSchema.parse(req.params.customerId),
        id = idSchema.parse(req.params.id);
      const body = customerAddressArchiveSchema.parse(req.body);
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
      assert(address, 404, 'Adresa nu există');
      const hash = addressArchiveHash(access.org.id, customerId, id, auth.user.id, body);
      const previous = await tx.customerAddress.findFirst({
        where: { archiveRequestKey: body.requestKey },
      });
      if (previous) {
        assert(
          previous.id === id &&
            previous.archiveRequestHash === hash &&
            previous.archivedByUserId === auth.user.id,
          409,
          'Cheia cererii a fost folosită pentru alte date',
        );
        return { address: customerAddressResponse(previous) };
      }
      assert(customer.status === 'ACTIVE', 409, 'Clientul este arhivat.');
      assert(
        address.status === 'ACTIVE' && address.version === body.version,
        409,
        'Adresa a fost modificată. Reîncărcați.',
      );
      await executeAddressCommand(
        tx,
        customer,
        address,
        auth.user.id,
        { ...body, action: 'ARCHIVE' },
        hash,
      );
      const updated = await tx.customerAddress.findUniqueOrThrow({ where: { id } });
      await audit(
        tx,
        auth,
        req,
        'customers.address.archived',
        'CUSTOMER_ADDRESS',
        id,
        body.locationId,
      );
      return { address: customerAddressResponse(updated) };
    }),
  );
}
