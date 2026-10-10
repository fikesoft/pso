import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { tableResponse } from '../../../entities/dining-table';
import { HttpError } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { requireTableAccess } from './table-access';
import { lockTable, replayTableCommand, saveTableCommand } from './table-command';
import type { TableMutation } from './table-command.types';
export async function mutateTable(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  command: TableMutation,
) {
  const { body } = command;
  requireTableAccess(access, actor, body.locationId, true);
  const identity = {
    locationId: body.locationId,
    requestKey: body.requestKey,
    kind: command.kind,
    ...(command.kind !== 'CREATE' ? { tableId: command.tableId } : {}),
  };
  const hash = requestHash({ organizationId: access.org.id, actor, ...command });
  const replay = await replayTableCommand(tx, identity, actor, hash);
  if (replay) return { table: replay, replayed: true };
  if (command.kind === 'CREATE') {
    if (
      await tx.diningTable.findFirst({
        where: { locationId: body.locationId, code: command.body.code },
      })
    )
      throw new HttpError(
        409,
        'Codul mesei este deja folosit în locație.',
        'DINING_TABLE_CODE_EXISTS',
      );
    const row = await tx.diningTable.create({
      data: {
        organizationId: access.org.id,
        locationId: body.locationId,
        code: command.body.code,
        name: command.body.name,
        capacity: command.body.capacity,
        sortOrder: command.body.sortOrder,
        createdByUserId: actor,
        updatedByUserId: actor,
        creationRequestKey: body.requestKey,
        lastRequestKey: body.requestKey,
        lastRequestHash: hash,
      },
    });
    await saveTableCommand(tx, row, identity, null);
    return { table: tableResponse(row), replayed: false };
  }
  const current = await lockTable(tx, body.locationId, command.tableId);
  if (current.status !== 'ACTIVE')
    throw new HttpError(409, 'Masa este arhivată.', 'DINING_TABLE_ARCHIVED');
  if (current.version !== command.body.version)
    throw new HttpError(
      409,
      'Masa a fost modificată. Reîncărcați.',
      'DINING_TABLE_VERSION_CONFLICT',
    );
  if (
    command.kind === 'ARCHIVE' &&
    (await tx.tableVisit.findFirst({ where: { tableId: current.id, status: 'OPEN' } }))
  )
    throw new HttpError(409, 'Masa are o vizită deschisă.', 'TABLE_HAS_OPEN_VISIT');
  const row = await tx.diningTable.update({
    where: { id: current.id, version: current.version },
    data: {
      ...(command.kind === 'UPDATE'
        ? {
            name: command.body.name,
            capacity: command.body.capacity,
            sortOrder: command.body.sortOrder,
          }
        : { status: 'ARCHIVED' }),
      version: { increment: 1 },
      updatedByUserId: actor,
      lastRequestKey: body.requestKey,
      lastRequestHash: hash,
    },
  });
  await saveTableCommand(tx, row, identity, command.body.version);
  return { table: tableResponse(row), replayed: false };
}
