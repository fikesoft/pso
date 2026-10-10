import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { stationResponse } from '../../../entities/kitchen-station';
import { HttpError } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { requireStationAccess } from './station-access';
import { lockStation, replayStationCommand, saveStationCommand } from './station-command';
import type { StationMutation } from './station-command.types';
export async function mutateStation(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  command: StationMutation,
) {
  const { body } = command;
  requireStationAccess(access, actor, body.locationId, true);
  const identity = {
    locationId: body.locationId,
    requestKey: body.requestKey,
    kind: command.kind,
    ...(command.kind !== 'CREATE' ? { stationId: command.stationId } : {}),
  };
  const hash = requestHash({ organizationId: access.org.id, actor, ...command });
  const replay = await replayStationCommand(tx, identity, actor, hash);
  if (replay) return { station: replay, replayed: true };
  if (command.kind === 'CREATE') {
    if (
      await tx.kitchenStation.findFirst({
        where: { locationId: body.locationId, code: command.body.code },
      })
    )
      throw new HttpError(
        409,
        'Codul stației este deja folosit în locație.',
        'KITCHEN_STATION_CODE_EXISTS',
      );
    const row = await tx.kitchenStation.create({
      data: {
        organizationId: access.org.id,
        locationId: body.locationId,
        code: command.body.code,
        name: command.body.name,
        sortOrder: command.body.sortOrder,
        createdByUserId: actor,
        updatedByUserId: actor,
        creationRequestKey: body.requestKey,
        lastRequestKey: body.requestKey,
        lastRequestHash: hash,
      },
    });
    await saveStationCommand(tx, row, identity, null);
    return { station: stationResponse(row), replayed: false };
  }
  const current = await lockStation(tx, body.locationId, command.stationId);
  if (current.status !== 'ACTIVE')
    throw new HttpError(409, 'Stația este arhivată.', 'KITCHEN_STATION_ARCHIVED');
  if (current.version !== command.body.version)
    throw new HttpError(
      409,
      'Stația a fost modificată. Reîncărcați.',
      'KITCHEN_STATION_VERSION_CONFLICT',
    );
  const row = await tx.kitchenStation.update({
    where: { id: current.id, version: current.version },
    data: {
      ...(command.kind === 'UPDATE'
        ? {
            name: command.body.name,
            sortOrder: command.body.sortOrder,
          }
        : { status: 'ARCHIVED' }),
      version: { increment: 1 },
      updatedByUserId: actor,
      lastRequestKey: body.requestKey,
      lastRequestHash: hash,
    },
  });
  await saveStationCommand(tx, row, identity, command.body.version);
  return { station: stationResponse(row), replayed: false };
}
