import { randomUUID } from 'node:crypto';
import type { Prisma, TenantTransaction } from '../../src';
import type { createSecurityFixture } from './security.fixture';
export { createSecurityFixture as createCashRegisterFixture } from './security.fixture';
export function registerData(
  f: Awaited<ReturnType<typeof createSecurityFixture>>,
  overrides: Partial<Prisma.CashRegisterUncheckedCreateInput> = {},
): Prisma.CashRegisterUncheckedCreateInput {
  const key = randomUUID();
  return {
    organizationId: f.a.organization.id,
    locationId: f.locationA.id,
    code: `R-${randomUUID().slice(0, 8).toUpperCase()}`,
    name: 'Casă sintetică',
    createdByUserId: f.a.user.id,
    updatedByUserId: f.a.user.id,
    creationRequestKey: key,
    lastRequestKey: key,
    lastRequestHash: 'a'.repeat(64),
    ...overrides,
  };
}
export function commandData(
  r: Prisma.CashRegisterGetPayload<Record<string, never>>,
  kind = 'CREATE',
  expectedVersion: number | null = null,
): Prisma.CashRegisterCommandUncheckedCreateInput {
  return {
    organizationId: r.organizationId,
    locationId: r.locationId,
    requestKey: r.lastRequestKey,
    kind,
    actorUserId: r.updatedByUserId,
    status: 'SUCCEEDED',
    registerId: r.id,
    requestHash: r.lastRequestHash,
    expectedVersion,
    resultCode: r.code,
    resultName: r.name,
    resultStatus: r.status,
    resultVersion: r.version,
    resultCreatedAt: r.createdAt,
    resultUpdatedAt: r.updatedAt,
  };
}
export async function createRegister(
  tx: TenantTransaction,
  data: Prisma.CashRegisterUncheckedCreateInput,
) {
  const row = await tx.cashRegister.create({ data });
  await tx.cashRegisterCommand.create({ data: commandData(row) });
  return row;
}
export async function updateRegister(
  tx: TenantTransaction,
  id: string,
  actor: string,
  kind: 'RENAME' | 'ARCHIVE' = 'RENAME',
  key = randomUUID(),
) {
  await tx.$queryRaw`SELECT id FROM "CashRegister" WHERE id=${id}::uuid FOR UPDATE`;
  const old = await tx.cashRegister.findUniqueOrThrow({ where: { id } });
  const row = await tx.cashRegister.update({
    where: { id },
    data: {
      ...(kind === 'RENAME' ? { name: `${old.name} nou` } : { status: 'ARCHIVED' }),
      version: { increment: 1 },
      updatedByUserId: actor,
      lastRequestKey: key,
      lastRequestHash: 'b'.repeat(64),
    },
  });
  await tx.cashRegisterCommand.create({ data: commandData(row, kind, old.version) });
  return row;
}
export function retireRegister(
  tx: TenantTransaction,
  f: Awaited<ReturnType<typeof createSecurityFixture>>,
  key: string,
  id?: string,
) {
  return tx.cashRegisterCommand.create({
    data: {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      requestKey: key,
      kind: id ? 'RENAME' : 'CREATE',
      registerId: id ?? null,
      actorUserId: f.a.user.id,
      status: 'RETIRED',
    },
  });
}
