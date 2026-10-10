import type { CourierCommand, CourierResolution } from '@pos/contracts';
import { courierProfileSchema } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { courierCommandResult, courierWorkload } from '../../../entities/courier';
import type { CourierCommandRow } from '../../../entities/courier';
import { assert } from '../../../shared/lib/http';
import { domainHmac } from '../../../shared/lib/sealed-json';
import { COURIER_COMMAND_DOMAIN } from '../config/couriers.constants';
import { courierEligible } from './courier-access';
import { courierView } from './courier-view';
export async function readCourierCommand(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  courierId: string,
  body: CourierResolution,
) {
  const command = await tx.courierCommand.findFirst({
    where: { organizationId, requestKey: body.requestKey },
  });
  if (command)
    assert(
      command.courierId === courierId &&
        command.actorUserId === actor &&
        command.locationId === body.locationId &&
        command.action === body.action,
      409,
      'Cheia aparține altei operațiuni.',
    );
  return command;
}
export async function courierOperationResponse(
  tx: TenantTransaction,
  access: AccessData,
  command: CourierCommandRow,
) {
  if (command.status === 'RETIRED')
    return {
      status: 'RETIRED' as const,
      courierId: command.courierId,
      locationId: command.locationId,
      requestKey: command.requestKey,
      action: command.action,
    };
  const row = await tx.courier.findFirst({
    where: { organizationId: access.org.id, locationId: command.locationId, id: command.courierId },
  });
  assert(row, 404, 'Curierul nu există.');
  return {
    status: 'SUCCEEDED' as const,
    result: courierCommandResult(command),
    courier: await courierView(tx, access, row),
  };
}
export async function executeCourierCommand(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  id: string,
  body: CourierCommand,
) {
  const profile = 'profile' in body ? body.profile : undefined;
  const version = 'version' in body ? body.version : undefined;
  const availability = 'availability' in body ? body.availability : undefined;
  const subject = 'userId' in body ? body.userId : undefined;
  const hash = domainHmac(
    COURIER_COMMAND_DOMAIN,
    JSON.stringify([
      access.org.id,
      actor,
      id,
      body.locationId,
      body.requestKey,
      body.action,
      version ?? null,
      subject ?? null,
      profile ?? null,
      availability ?? null,
    ]),
  );
  const previous = await readCourierCommand(tx, access.org.id, actor, id, body);
  if (previous) {
    assert(previous.status === 'SUCCEEDED', 409, 'Tentativa a fost retrasă.');
    assert(previous.requestHash === hash, 409, 'Cheia cererii aparține altor date.');
    return { command: previous, replayed: true };
  }
  const row = await tx.courier.findFirst({ where: { organizationId: access.org.id, id } });
  if (body.action === 'CREATE') {
    assert(!row, 409, 'Identitatea profilului există deja.');
    assert(
      !(await tx.courier.findFirst({
        where: { organizationId: access.org.id, locationId: body.locationId, userId: body.userId },
      })),
      409,
      'Utilizatorul are deja un profil în această locație. Restaurați profilul arhivat.',
    );
  } else {
    assert(row && row.locationId === body.locationId, 404, 'Curierul nu există.');
    assert(
      row.version === version &&
        row.version < 2147483647 &&
        row.status === (body.action === 'RESTORE' ? 'ARCHIVED' : 'ACTIVE'),
      409,
      'Profilul a fost modificat. Reîncărcați.',
    );
    if (profile)
      assert(
        JSON.stringify(courierProfileSchema.parse(row.profile)) !== JSON.stringify(profile),
        409,
        'Profilul conține deja aceste date.',
      );
    if (availability)
      assert(availability !== row.availability, 409, 'Disponibilitatea este deja setată.');
  }
  const userId = subject ?? row!.userId;
  const finalAvailability = ['CREATE', 'ARCHIVE', 'RESTORE'].includes(body.action)
    ? 'OFFLINE'
    : (availability ?? row!.availability);
  if (body.action === 'CREATE' || body.action === 'RESTORE' || finalAvailability === 'AVAILABLE')
    assert(
      courierEligible(access, userId, body.locationId),
      409,
      'Curierul necesită identitate activă și drepturi de citire/livrare în această locație.',
    );
  const count = await courierWorkload(tx, access.org.id, body.locationId, userId);
  const finalProfile = profile ?? courierProfileSchema.parse(row!.profile);
  assert(
    count <= finalProfile.capacity && (finalAvailability !== 'OFFLINE' || count === 0),
    409,
    'Livrările active împiedică trecerea offline, arhivarea sau reducerea capacității.',
  );
  const command = await tx.courierCommand.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      courierId: id,
      actorUserId: actor,
      requestKey: body.requestKey,
      action: body.action,
      status: 'SUCCEEDED',
      requestHash: hash,
      expectedVersion: version,
      userId: subject,
      profile,
      availability,
    },
  });
  return { command, replayed: false };
}
