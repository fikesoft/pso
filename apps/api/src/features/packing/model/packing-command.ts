import { packingCommandResultSchema } from '@pos/contracts';
import type { PackingCommandInput, ResolvePackingCommandInput } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { effectiveOrderStatus } from '../../../entities/order';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import type { StoredPackingCommand, StoredPackingSession } from './packing.types';

export function packingCommandResult(row: StoredPackingCommand) {
  return packingCommandResultSchema.parse({
    sessionId: row.sessionId,
    requestKey: row.requestKey,
    action: row.action,
    expectedVersion: row.expectedVersion,
    version: row.resultVersion,
    status: row.resultStatus,
    occurredAt: row.createdAt.toISOString(),
    ...(row.action === 'CHECK_ITEM' ? { itemId: row.itemId, checked: row.checked } : {}),
  });
}

export async function readPackingCommand(
  tx: TenantTransaction,
  session: StoredPackingSession,
  actorUserId: string,
  command: ResolvePackingCommandInput,
) {
  const previous = await tx.packingCommand.findFirst({
    where: { organizationId: session.organizationId, requestKey: command.requestKey },
  });
  if (previous)
    assert(
      previous.actorUserId === actorUserId &&
        previous.sessionId === session.id &&
        previous.locationId === session.locationId &&
        previous.action === command.action,
      409,
      'Cheia cererii aparține altei operațiuni.',
    );
  return previous;
}

export async function executePackingCommand(
  tx: TenantTransaction,
  session: StoredPackingSession,
  actorUserId: string,
  body: PackingCommandInput,
) {
  const command = { sessionId: session.id, requestKey: body.requestKey, action: body.action };
  const hash = requestHash({
    organizationId: session.organizationId,
    actorUserId,
    ...command,
    ...body,
  });
  const previous = await readPackingCommand(tx, session, actorUserId, command);
  if (previous) {
    assert(previous.status === 'SUCCEEDED', 409, 'Tentativa a fost retrasă.');
    assert(previous.requestHash === hash, 409, 'Cheia cererii a fost folosită pentru alte date.');
    return { result: packingCommandResult(previous), replayed: true };
  }
  assert(session.version === body.version, 409, 'Sesiunea a fost modificată. Reîncărcați.');
  const order = await tx.order.findFirst({
    where: {
      organizationId: session.organizationId,
      locationId: session.locationId,
      id: session.orderId,
    },
  });
  assert(
    order &&
      order.kitchenStatus === 'READY' &&
      ['IN_PROGRESS', 'READY'].includes(effectiveOrderStatus(order.status, order.kitchenStatus)),
    409,
    'Comanda trebuie să fie activă și complet preparată.',
  );
  assert(
    session.status === (body.action === 'START' ? 'WAITING' : 'PACKING'),
    409,
    'Starea sesiunii nu permite această operație.',
  );
  const scope = {
    organizationId: session.organizationId,
    locationId: session.locationId,
    sessionId: session.id,
  };
  if (body.action === 'CHECK_ITEM') {
    const item = await tx.packingItem.findFirst({ where: { ...scope, id: body.itemId } });
    assert(item, 404, 'Articolul nu aparține sesiunii.');
    assert(item.checked !== body.checked, 409, 'Articolul are deja starea solicitată.');
  } else if (body.action === 'COMPLETE') {
    const total = await tx.packingItem.count({ where: scope });
    const missing = await tx.packingItem.count({ where: { ...scope, checked: false } });
    assert(total > 0 && missing === 0, 409, 'Verificați toate articolele înainte de predare.');
  }
  const row = await tx.packingCommand.create({
    data: {
      ...scope,
      actorUserId,
      requestKey: body.requestKey,
      action: body.action,
      status: 'SUCCEEDED',
      requestHash: hash,
      expectedVersion: body.version,
      ...(body.action === 'CHECK_ITEM' ? { itemId: body.itemId, checked: body.checked } : {}),
    },
  });
  return { result: packingCommandResult(row), replayed: false };
}
