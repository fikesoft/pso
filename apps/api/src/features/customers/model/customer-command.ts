import type { CustomerManagementCommand, CustomerManagementResolution } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { customerProfile, customerProfileColumns } from '../../../entities/customer';
import { domainHmac } from '../../../shared/lib/sealed-json';
import { assert, HttpError } from '../../../shared/lib/http';
import { CUSTOMER_COMMAND_DOMAIN } from '../config/customer-management.constants';
import type { ManagedCustomer } from './customer-management.types';

export async function readCustomerCommand(
  tx: TenantTransaction,
  customer: ManagedCustomer,
  actorUserId: string,
  body: CustomerManagementResolution,
) {
  const previous = await tx.customerCommand.findFirst({
    where: { organizationId: customer.organizationId, requestKey: body.requestKey },
  });
  if (previous)
    assert(
      previous.customerId === customer.id &&
        previous.locationId === body.locationId &&
        previous.actorUserId === actorUserId &&
        previous.action === body.action,
      409,
      'Cheia cererii aparține altei operațiuni.',
    );
  return previous;
}
export async function executeCustomerCommand(
  tx: TenantTransaction,
  customer: ManagedCustomer,
  actorUserId: string,
  body: CustomerManagementCommand,
) {
  const profile =
    body.action === 'UPDATE' ? { ...body.profile, name: body.profile.name || null } : null;
  const hash = domainHmac(
    CUSTOMER_COMMAND_DOMAIN,
    JSON.stringify([
      customer.organizationId,
      customer.id,
      actorUserId,
      body.locationId,
      body.requestKey,
      body.action,
      body.version,
      profile,
    ]),
  );
  const previous = await readCustomerCommand(tx, customer, actorUserId, body);
  if (previous) {
    assert(previous.status === 'SUCCEEDED', 409, 'Tentativa a fost retrasă.');
    assert(previous.requestHash === hash, 409, 'Cheia cererii a fost folosită pentru alte date.');
    return { command: previous, replayed: true };
  }
  assert(customer.version === body.version, 409, 'Profilul a fost modificat. Reîncărcați.');
  assert(
    customer.status === (body.action === 'RESTORE' ? 'ARCHIVED' : 'ACTIVE'),
    409,
    'Starea profilului nu permite această operație.',
  );
  const columns = profile
    ? customerProfileColumns(customer.organizationId, customer.id, profile)
    : null;
  if (profile && columns) {
    const current = customerProfile(customer);
    assert(
      current.name !== profile.name ||
        current.phone !== profile.phone ||
        current.email !== profile.email,
      409,
      'Profilul conține deja aceste date.',
    );
    const duplicate = await tx.customer.findFirst({
      where: {
        organizationId: customer.organizationId,
        id: { not: customer.id },
        phoneLookupHash: columns.phoneLookupHash,
      },
      select: { id: true },
    });
    if (duplicate)
      throw new HttpError(
        409,
        'Telefonul aparține deja unui profil al organizației.',
        'CUSTOMER_PHONE_EXISTS',
      );
  }
  const command = await tx.customerCommand.create({
    data: {
      organizationId: customer.organizationId,
      customerId: customer.id,
      actorUserId,
      locationId: body.locationId,
      requestKey: body.requestKey,
      action: body.action,
      expectedVersion: body.version,
      status: 'SUCCEEDED',
      requestHash: hash,
      ...columns,
    },
  });
  return { command, replayed: false };
}
