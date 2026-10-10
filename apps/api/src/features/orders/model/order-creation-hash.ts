import { deliveryAddressHash } from '../../../shared/lib/delivery-address';
import type { createOrderSchema } from '@pos/contracts';
import type { z } from 'zod';
import { canonicalizeModifierSelections } from '../../../entities/catalog-modifiers';
import { customerCreationHash } from '../../../entities/order';
import { requestHash } from '../../../shared/lib/idempotency';
export function orderCreationHash(
  organizationId: string,
  body: z.output<typeof createOrderSchema>,
) {
  const { source, customer, customerRef, deliveryAddress, addressRef, ...originalBody } = body;
  const customerHash = customerCreationHash(organizationId, customer);
  const addressHash = deliveryAddressHash(organizationId, deliveryAddress);
  return requestHash({
    ...originalBody,
    ...(source === 'POS' ? {} : { source }),
    ...(customerHash ? { customerHash } : {}),
    ...(customerRef ? { customerRef } : {}),
    ...(addressHash ? { addressHash } : {}),
    ...(addressRef ? { addressRef } : {}),
    items: body.items.map((item) => {
      const { modifiers, ...metadata } = item;
      const choices = canonicalizeModifierSelections(modifiers);
      return choices.length ? { ...metadata, modifiers: choices } : metadata;
    }),
  });
}
