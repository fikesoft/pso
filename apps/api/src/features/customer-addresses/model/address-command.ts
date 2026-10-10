import type { AddressManagementCommand, AddressManagementResolution } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { addressProfileColumns, customerAddressResponse } from '../../../entities/customer-address';
import { domainHmac } from '../../../shared/lib/sealed-json';
import { assert } from '../../../shared/lib/http';
import { ADDRESS_COMMAND_DOMAIN } from '../config/address-management.constants';
import type { AddressCustomer, ManagedAddress } from './address-management.types';
export async function readAddressCommand(
  tx: TenantTransaction,
  address: ManagedAddress,
  actorUserId: string,
  body: AddressManagementResolution,
) {
  const previous = await tx.customerAddressCommand.findFirst({
    where: { organizationId: address.organizationId, requestKey: body.requestKey },
  });
  if (previous)
    assert(
      previous.customerId === address.customerId &&
        previous.addressId === address.id &&
        previous.locationId === body.locationId &&
        previous.actorUserId === actorUserId &&
        previous.action === body.action,
      409,
      'Cheia cererii aparține altei operațiuni.',
    );
  return previous;
}
export async function assertAddressCommandKeyFree(tx: TenantTransaction, requestKey: string) {
  assert(
    !(await tx.customerAddress.findFirst({
      where: { archiveRequestKey: requestKey },
      select: { id: true },
    })),
    409,
    'Cheia cererii aparține unei arhivări existente.',
  );
}
export async function executeAddressCommand(
  tx: TenantTransaction,
  customer: AddressCustomer,
  address: ManagedAddress,
  actorUserId: string,
  body: AddressManagementCommand,
  legacyArchiveHash?: string,
) {
  const profile = body.action === 'UPDATE' ? body.profile : null;
  const preferenceVersion = 'preferenceVersion' in body ? body.preferenceVersion : null;
  const hash =
    legacyArchiveHash ??
    domainHmac(
      ADDRESS_COMMAND_DOMAIN,
      JSON.stringify([
        customer.organizationId,
        customer.id,
        address.id,
        actorUserId,
        body.locationId,
        body.requestKey,
        body.action,
        body.version,
        preferenceVersion,
        profile,
      ]),
    );
  const previous = await readAddressCommand(tx, address, actorUserId, body);
  if (previous) {
    assert(previous.status === 'SUCCEEDED', 409, 'Tentativa a fost retrasă.');
    assert(previous.requestHash === hash, 409, 'Cheia cererii a fost folosită pentru alte date.');
    return { command: previous, replayed: true };
  }
  await assertAddressCommandKeyFree(tx, body.requestKey);
  assert(customer.status === 'ACTIVE', 409, 'Clientul este arhivat.');
  assert(
    address.status === 'ACTIVE' && address.version === body.version,
    409,
    'Adresa a fost modificată. Reîncărcați.',
  );
  if (profile) {
    const current = customerAddressResponse(address);
    assert(
      current.label !== profile.label ||
        current.address !== profile.address ||
        current.instructions !== profile.instructions,
      409,
      'Adresa conține deja aceste date.',
    );
  }
  if (preferenceVersion !== null) {
    const preference = await tx.customerAddressPreference.findUniqueOrThrow({
      where: { customerId: customer.id },
    });
    assert(
      preference.version === preferenceVersion,
      409,
      'Preferința a fost modificată. Reîncărcați.',
    );
    assert(
      body.action === 'SET_DEFAULT'
        ? preference.defaultAddressId !== address.id
        : preference.defaultAddressId === address.id,
      409,
      'Preferința curentă nu permite această operație.',
    );
  }
  const command = await tx.customerAddressCommand.create({
    data: {
      organizationId: customer.organizationId,
      customerId: customer.id,
      addressId: address.id,
      locationId: body.locationId,
      actorUserId,
      requestKey: body.requestKey,
      action: body.action,
      status: 'SUCCEEDED',
      requestHash: hash,
      expectedVersion: body.version,
      expectedPreferenceVersion: preferenceVersion,
      ...(profile
        ? addressProfileColumns(customer.organizationId, customer.id, address.id, profile)
        : {}),
    },
  });
  return { command, replayed: false };
}
