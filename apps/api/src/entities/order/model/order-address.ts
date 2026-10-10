import { deliveryAddressSchema } from '@pos/contracts';
import type { DeliveryAddressInput } from '@pos/contracts';
import { ORDER_DELIVERY_ADDRESS_DOMAIN } from '../../../shared/config/address.constants';
import {
  normalizeDeliveryAddress,
  deliveryAddressHash,
} from '../../../shared/lib/delivery-address';
import { sealJson, openJson } from '../../../shared/lib/sealed-json';
import type { OrderAddressContext, OrderAddressColumns } from './order-address.types';
export function orderAddressColumns(
  context: OrderAddressContext,
  input: DeliveryAddressInput | null | undefined,
): OrderAddressColumns {
  const address = normalizeDeliveryAddress(input);
  return {
    deliveryAddressEncrypted: address
      ? sealJson(
          ORDER_DELIVERY_ADDRESS_DOMAIN,
          [context.organizationId, context.locationId, context.id],
          address,
        )
      : null,
    deliveryAddressHash: deliveryAddressHash(context.organizationId, input),
  };
}
export function readOrderAddress(order: OrderAddressContext & OrderAddressColumns) {
  return order.deliveryAddressEncrypted
    ? normalizeDeliveryAddress(
        deliveryAddressSchema.parse(
          openJson(
            ORDER_DELIVERY_ADDRESS_DOMAIN,
            [order.organizationId, order.locationId, order.id],
            order.deliveryAddressEncrypted,
          ),
        ),
      )
    : null;
}
