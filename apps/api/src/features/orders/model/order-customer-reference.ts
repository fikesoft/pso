import type { CustomerReference, OrderCustomerInput } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { customerResponse, requireCustomerAccess } from '../../../entities/customer';
import { orderCustomerColumns } from '../../../entities/order';
import type { StoredOrder } from '../../../entities/order';
import { visibleLocations } from '../../../entities/tenant-access';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function requireLinkedCustomerAccess(
  access: AccessData,
  userId: string,
  order: { locationId: string; customerId: string | null },
) {
  if (!order.customerId) return;
  requireCustomerRead(access, userId, order.locationId);
}
export function requireCustomerRead(access: AccessData, userId: string, locationId: string) {
  requireCustomerAccess({
    organizationId: access.org.id,
    locationId,
    visibleLocationIds: visibleLocations(access, userId).map((location) => location.id),
    canUse: (permission, scope) => access.service.canUse(userId, permission, scope),
  });
}
export async function orderContactPatch(
  tx: TenantTransaction,
  access: AccessData,
  userId: string,
  order: Pick<StoredOrder, 'id' | 'organizationId' | 'locationId'>,
  body: { customer?: OrderCustomerInput | null; customerRef?: CustomerReference | null },
) {
  if (body.customerRef) {
    requireLinkedCustomerAccess(access, userId, {
      locationId: order.locationId,
      customerId: body.customerRef.id,
    });
    const customer = await tx.customer.findUnique({ where: { id: body.customerRef.id } });
    assert(customer, 404, 'Clientul nu există');
    assert(customer.status === 'ACTIVE', 409, 'Clientul este arhivat.');
    assert(
      customer.version === body.customerRef.version,
      409,
      'Profilul clientului a fost modificat. Reîncărcați.',
    );
    return {
      ...orderCustomerColumns(order, customerResponse(customer)),
      customerId: customer.id,
      customerVersionSnapshot: customer.version,
    };
  }
  if (body.customer !== undefined)
    return {
      ...orderCustomerColumns(order, body.customer),
      customerId: null,
      customerVersionSnapshot: null,
    };
  return body.customerRef === null ? { customerId: null, customerVersionSnapshot: null } : {};
}
