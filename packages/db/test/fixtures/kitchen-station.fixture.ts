import { randomUUID } from 'node:crypto';
import type { Prisma, TenantTransaction } from '../../src';
import type { createSecurityFixture } from './security.fixture';
export { createSecurityFixture as createKitchenStationFixture } from './security.fixture';
export function stationData(
  f: Awaited<ReturnType<typeof createSecurityFixture>>,
  overrides: Partial<Prisma.KitchenStationUncheckedCreateInput> = {},
): Prisma.KitchenStationUncheckedCreateInput {
  const key = randomUUID();
  return {
    organizationId: f.a.organization.id,
    locationId: f.locationA.id,
    code: `R-${randomUUID().slice(0, 8).toUpperCase()}`,
    name: 'Stație sintetică',
    sortOrder: 10,
    createdByUserId: f.a.user.id,
    updatedByUserId: f.a.user.id,
    creationRequestKey: key,
    lastRequestKey: key,
    lastRequestHash: 'a'.repeat(64),
    ...overrides,
  };
}
export function commandData(
  r: Prisma.KitchenStationGetPayload<Record<string, never>>,
  kind = 'CREATE',
  expectedVersion: number | null = null,
): Prisma.KitchenStationCommandUncheckedCreateInput {
  return {
    organizationId: r.organizationId,
    locationId: r.locationId,
    requestKey: r.lastRequestKey,
    kind,
    actorUserId: r.updatedByUserId,
    status: 'SUCCEEDED',
    stationId: r.id,
    requestHash: r.lastRequestHash,
    expectedVersion,
    resultCode: r.code,
    resultName: r.name,
    resultSortOrder: r.sortOrder,
    resultStatus: r.status,
    resultVersion: r.version,
    resultCreatedAt: r.createdAt,
    resultUpdatedAt: r.updatedAt,
  };
}
export async function createStation(
  tx: TenantTransaction,
  data: Prisma.KitchenStationUncheckedCreateInput,
) {
  const row = await tx.kitchenStation.create({ data });
  await tx.kitchenStationCommand.create({ data: commandData(row) });
  return row;
}
export async function updateStation(
  tx: TenantTransaction,
  id: string,
  actor: string,
  kind: 'UPDATE' | 'ARCHIVE' = 'UPDATE',
  key = randomUUID(),
) {
  await tx.$queryRaw`SELECT id FROM "KitchenStation" WHERE id=${id}::uuid FOR NO KEY UPDATE`;
  const old = await tx.kitchenStation.findUniqueOrThrow({ where: { id } });
  const row = await tx.kitchenStation.update({
    where: { id },
    data: {
      ...(kind === 'UPDATE' ? { name: `${old.name} nou` } : { status: 'ARCHIVED' }),
      version: { increment: 1 },
      updatedByUserId: actor,
      lastRequestKey: key,
      lastRequestHash: 'b'.repeat(64),
    },
  });
  await tx.kitchenStationCommand.create({ data: commandData(row, kind, old.version) });
  return row;
}
export function retireStation(
  tx: TenantTransaction,
  f: Awaited<ReturnType<typeof createSecurityFixture>>,
  key: string,
  id?: string,
) {
  return tx.kitchenStationCommand.create({
    data: {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      requestKey: key,
      kind: id ? 'UPDATE' : 'CREATE',
      stationId: id ?? null,
      actorUserId: f.a.user.id,
      status: 'RETIRED',
    },
  });
}
