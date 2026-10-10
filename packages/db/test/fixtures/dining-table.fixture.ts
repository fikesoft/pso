import { randomUUID } from 'node:crypto';
import type { Prisma, TenantTransaction } from '../../src';
import type { createSecurityFixture } from './security.fixture';
export { createSecurityFixture as createDiningTableFixture } from './security.fixture';
export function tableData(
  f: Awaited<ReturnType<typeof createSecurityFixture>>,
  overrides: Partial<Prisma.DiningTableUncheckedCreateInput> = {},
): Prisma.DiningTableUncheckedCreateInput {
  const key = randomUUID();
  return {
    organizationId: f.a.organization.id,
    locationId: f.locationA.id,
    code: `R-${randomUUID().slice(0, 8).toUpperCase()}`,
    name: 'Masă sintetică',
    capacity: 4,
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
  r: Prisma.DiningTableGetPayload<Record<string, never>>,
  kind = 'CREATE',
  expectedVersion: number | null = null,
): Prisma.DiningTableCommandUncheckedCreateInput {
  return {
    organizationId: r.organizationId,
    locationId: r.locationId,
    requestKey: r.lastRequestKey,
    kind,
    actorUserId: r.updatedByUserId,
    status: 'SUCCEEDED',
    tableId: r.id,
    requestHash: r.lastRequestHash,
    expectedVersion,
    resultCode: r.code,
    resultName: r.name,
    resultCapacity: r.capacity,
    resultSortOrder: r.sortOrder,
    resultStatus: r.status,
    resultVersion: r.version,
    resultCreatedAt: r.createdAt,
    resultUpdatedAt: r.updatedAt,
  };
}
export async function createTable(
  tx: TenantTransaction,
  data: Prisma.DiningTableUncheckedCreateInput,
) {
  const row = await tx.diningTable.create({ data });
  await tx.diningTableCommand.create({ data: commandData(row) });
  return row;
}
export async function updateTable(
  tx: TenantTransaction,
  id: string,
  actor: string,
  kind: 'UPDATE' | 'ARCHIVE' = 'UPDATE',
  key = randomUUID(),
) {
  await tx.$queryRaw`SELECT id FROM "DiningTable" WHERE id=${id}::uuid FOR NO KEY UPDATE`;
  const old = await tx.diningTable.findUniqueOrThrow({ where: { id } });
  const row = await tx.diningTable.update({
    where: { id },
    data: {
      ...(kind === 'UPDATE' ? { name: `${old.name} nou` } : { status: 'ARCHIVED' }),
      version: { increment: 1 },
      updatedByUserId: actor,
      lastRequestKey: key,
      lastRequestHash: 'b'.repeat(64),
    },
  });
  await tx.diningTableCommand.create({ data: commandData(row, kind, old.version) });
  return row;
}
export function retireTable(
  tx: TenantTransaction,
  f: Awaited<ReturnType<typeof createSecurityFixture>>,
  key: string,
  id?: string,
) {
  return tx.diningTableCommand.create({
    data: {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      requestKey: key,
      kind: id ? 'UPDATE' : 'CREATE',
      tableId: id ?? null,
      actorUserId: f.a.user.id,
      status: 'RETIRED',
    },
  });
}
