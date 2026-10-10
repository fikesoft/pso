import { idSchema } from '@pos/contracts';
import type { CustomerManagementList, CustomerManagementSearch } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { customerLookupHash } from '../../../shared/lib/customer-identity';
import { sealJson, openJson } from '../../../shared/lib/sealed-json';
import { assert, HttpError } from '../../../shared/lib/http';
import { CUSTOMER_CURSOR_DOMAIN } from '../config/customer-management.constants';
import { managedCustomerResponse } from './customer-management';
import type { CustomerCursorContext } from './customer-management.types';

function associated(context: CustomerCursorContext) {
  return [
    context.organizationId,
    context.actorUserId,
    context.locationId,
    context.status,
    context.field ?? '',
    context.queryHash ?? '',
  ];
}
export async function listManagedCustomers(
  tx: TenantTransaction,
  organizationId: string,
  actorUserId: string,
  query: CustomerManagementList,
  search?: CustomerManagementSearch,
) {
  const queryHash = search
    ? customerLookupHash(organizationId, search.field === 'PHONE' ? 'phone' : 'name', search.query)
    : null;
  assert(!search || queryHash, 400, 'Introduceți o valoare validă pentru căutare.');
  const context: CustomerCursorContext = {
    organizationId,
    actorUserId,
    locationId: query.locationId,
    status: query.status,
    field: search?.field ?? null,
    queryHash,
  };
  let after: string | undefined;
  if (query.cursor) {
    try {
      const value = openJson(CUSTOMER_CURSOR_DOMAIN, associated(context), query.cursor) as {
        id?: unknown;
      };
      after = idSchema.parse(value.id);
    } catch {
      throw new HttpError(400, 'Cursorul clienților nu este valid pentru acest context.');
    }
  }
  const rows = await tx.customer.findMany({
    where: {
      organizationId,
      ...(query.status === 'ALL' ? {} : { status: query.status }),
      ...(after ? { id: { gt: after } } : {}),
      ...(search
        ? search.field === 'PHONE'
          ? { phoneLookupHash: queryHash! }
          : { nameLookupHash: queryHash }
        : {}),
    },
    orderBy: { id: 'asc' },
    take: query.limit + 1,
  });
  const page = rows.slice(0, query.limit);
  return {
    customers: page.map(managedCustomerResponse),
    nextCursor:
      rows.length > query.limit
        ? sealJson(CUSTOMER_CURSOR_DOMAIN, associated(context), { id: page.at(-1)!.id })
        : null,
  };
}
