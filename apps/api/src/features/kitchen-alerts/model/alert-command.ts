import type { TenantTransaction } from '@pos/db';
import type {
  KitchenAlertCommandIdentity,
  KitchenAlertIdentity,
  KitchenAlertRule,
  KitchenAlertSetRequest,
} from '@pos/contracts';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import type { StoredAlertCommand } from './alert-command.types';

export function alertIdentityFields(identity: KitchenAlertIdentity) {
  const { scope, target } = identity;
  return {
    scopeType: scope.scopeType,
    locationId: scope.scopeType === 'LOCATION' ? scope.locationId : null,
    targetKind: target.kind,
    stationId: target.kind === 'STATION' ? target.stationId : null,
    categoryId: target.kind === 'CATEGORY' ? target.categoryId : null,
    productId: target.kind === 'PRODUCT' ? target.productId : null,
  };
}

export function alertResponse(row: StoredAlertCommand): KitchenAlertRule {
  return {
    scope:
      row.scopeType === 'ORGANIZATION'
        ? { scopeType: 'ORGANIZATION' }
        : { scopeType: 'LOCATION', locationId: row.locationId! },
    target:
      row.targetKind === 'PRODUCT'
        ? { kind: 'PRODUCT', productId: row.productId! }
        : row.targetKind === 'CATEGORY'
          ? { kind: 'CATEGORY', categoryId: row.categoryId! }
          : row.targetKind === 'STATION'
            ? { kind: 'STATION', stationId: row.stationId! }
            : { kind: 'DEFAULT' },
    version: row.resultVersion!,
    thresholds:
      row.warningSeconds === null
        ? null
        : { warningSeconds: row.warningSeconds, criticalSeconds: row.criticalSeconds! },
  };
}

export async function currentAlert(
  tx: TenantTransaction,
  organizationId: string,
  identity: KitchenAlertIdentity,
) {
  const row = await tx.kitchenAlertCommand.findFirst({
    where: { organizationId, ...alertIdentityFields(identity), status: 'SUCCEEDED' },
    orderBy: { resultVersion: 'desc' },
  });
  return row
    ? alertResponse(row)
    : { scope: identity.scope, target: identity.target, version: 0, thresholds: null };
}

export async function readAlertCommand(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  identity: KitchenAlertCommandIdentity,
) {
  const row = await tx.kitchenAlertCommand.findFirst({
    where: { organizationId, requestKey: identity.requestKey },
  });
  if (row) {
    const fields = alertIdentityFields(identity);
    assert(
      row.actorUserId === actor &&
        Object.entries(fields).every(([key, value]) => row[key as keyof typeof fields] === value),
      409,
      'Cheia cererii aparține altei operațiuni.',
    );
  }
  return row;
}

export async function setAlert(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  body: KitchenAlertSetRequest,
) {
  const hash = requestHash({ organizationId, actor, ...body });
  const previous = await readAlertCommand(tx, organizationId, actor, body);
  if (previous) {
    assert(previous.status === 'SUCCEEDED', 409, 'Tentativa a fost retrasă.');
    assert(previous.requestHash === hash, 409, 'Cheia cererii a fost folosită pentru alte date.');
    return { rule: alertResponse(previous), replayed: true };
  }
  const current = await currentAlert(tx, organizationId, body);
  assert(current.version === body.version, 409, 'Pragurile au fost modificate. Reîncărcați.');
  const row = await tx.kitchenAlertCommand.create({
    data: {
      organizationId,
      actorUserId: actor,
      ...alertIdentityFields(body),
      requestKey: body.requestKey,
      status: 'SUCCEEDED',
      requestHash: hash,
      expectedVersion: body.version,
      resultVersion: body.version + 1,
      warningSeconds: body.thresholds?.warningSeconds ?? null,
      criticalSeconds: body.thresholds?.criticalSeconds ?? null,
    },
  });
  return { rule: alertResponse(row), replayed: false };
}

export async function resolveAlertCommand(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  identity: KitchenAlertCommandIdentity,
) {
  const previous = await readAlertCommand(tx, organizationId, actor, identity);
  return (
    previous ??
    tx.kitchenAlertCommand.create({
      data: {
        organizationId,
        actorUserId: actor,
        ...alertIdentityFields(identity),
        requestKey: identity.requestKey,
        status: 'RETIRED',
      },
    })
  );
}
