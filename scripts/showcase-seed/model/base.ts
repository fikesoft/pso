import { withTenantTransaction } from '../../../packages/db/src/index';
import { seedDemoCatalog } from '../../../apps/api/src/app/model/demo-catalog';
import { loadAuthorization } from '../../../apps/api/src/entities/tenant-access';
import { mutateRegister } from '../../../apps/api/src/features/cash-registers/model/register-mutation';
import { mutateTable } from '../../../apps/api/src/features/tables/model/table-mutation';
import { executeCourierCommand } from '../../../apps/api/src/features/couriers/model/courier-command';
import { STAFF_PROFILES } from '../config/staff.constants';
import { SHOWCASE } from '../config/seed.constants';
import { SHOWCASE_MENU } from '../config/menu.constants';
import { createSeedStaff } from './staff';
import { seedKey } from './record';
import type { SeedClients, SeedIdentity, SeedRecord, SeedReferences } from './seed.types';

export async function seedBase(
  clients: SeedClients,
  record: SeedRecord,
  identity: SeedIdentity,
): Promise<SeedReferences> {
  const organizationId = identity.organization.id;
  const adminId = identity.user.id;
  return withTenantTransaction(clients.runtime, { organizationId, userId: adminId }, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId},0))`;
    const marker = await tx.auditEvent.findFirst({
      where: { action: 'showcase.base.complete', requestId: record.id },
    });
    if (!marker) {
      if (
        (await tx.location.count()) ||
        (await tx.product.count()) ||
        (await tx.role.count()) ||
        (await tx.companyUser.count()) !== 1
      )
        throw new Error('Compania are deja date incompatibile. Seedul nu le suprascrie.');
      const brand = await tx.brand.create({
        data: { organizationId, name: 'Nori Sushi · DEMO', code: 'NORI-DEMO' },
      });
      const locationIds: string[] = [];
      for (const [index, location] of SHOWCASE.locations.entries()) {
        const row = await tx.location.create({
          data: {
            id: seedKey(record, `location:${index}`),
            organizationId,
            brandId: brand.id,
            ...location,
            businessHours: Array.from({ length: 7 }, (_, day) => ({
              day,
              opensAt: '10:00',
              closesAt: '22:00',
            })),
          },
        });
        locationIds.push(row.id);
      }
      await createSeedStaff(tx, record, identity, locationIds);
      await seedDemoCatalog(tx, organizationId, adminId, SHOWCASE_MENU);
      const policy = await loadAuthorization(tx, organizationId);
      const currentUser = policy.users.find((user) => user.id === adminId)!;
      const access = { ...policy, currentUser };
      for (const [index, locationId] of locationIds.entries()) {
        const courier = record.users.find(
          (u) => u.location === index && STAFF_PROFILES[u.profile]!.login === 'curier',
        )!;
        await executeCourierCommand(tx, access, adminId, seedKey(record, `courier:${index}`), {
          action: 'CREATE',
          locationId,
          userId: courier.id,
          profile: { vehicle: 'BICYCLE', capacity: 5 },
          requestKey: seedKey(record, `courier-create:${index}`),
        });
        await mutateRegister(tx, access, adminId, {
          kind: 'CREATE',
          body: {
            locationId,
            code: 'DEMO-1',
            name: 'Casă de exercițiu DEMO',
            requestKey: seedKey(record, `register:${index}`),
          },
        });
        for (let table = 1; table <= 8; table++)
          await mutateTable(tx, access, adminId, {
            kind: 'CREATE',
            body: {
              locationId,
              code: `M${table}`,
              name: `Masa DEMO ${table}`,
              capacity: table <= 4 ? 2 : 4,
              sortOrder: table,
              requestKey: seedKey(record, `table:${index}:${table}`),
            },
          });
      }
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorPlatformAdminId: record.platform.id,
          action: 'showcase.base.complete',
          targetType: 'ORGANIZATION',
          targetId: organizationId,
          outcome: 'SUCCESS',
          requestId: record.id,
          metadata: {
            synthetic: true,
            source: 'private-showcase-seed',
            products: SHOWCASE_MENU.length,
            staff: record.users.length,
          },
        },
      });
    }
    const locationIds = SHOWCASE.locations.map((_, i) => seedKey(record, `location:${i}`));
    const registers = await tx.cashRegister.findMany({
      where: { locationId: { in: locationIds }, code: 'DEMO-1' },
    });
    if (registers.length !== locationIds.length)
      throw new Error('O casă din seed lipsește; nu o recreez.');
    return {
      organizationId,
      adminId,
      locationIds,
      registerIds: locationIds.map(
        (id) => registers.find((register) => register.locationId === id)!.id,
      ),
      products: await tx.product.findMany({
        where: { sku: { in: SHOWCASE_MENU.map((p) => p.sku) } },
        select: { id: true, sku: true },
        orderBy: { sku: 'asc' },
      }),
      inventory: await tx.inventoryItem.findMany({
        select: { id: true, unit: true },
        orderBy: { sku: 'asc' },
      }),
    };
  });
}

export async function markEmptyCompany(
  clients: SeedClients,
  record: SeedRecord,
  identity: SeedIdentity,
) {
  await withTenantTransaction(
    clients.runtime,
    { organizationId: identity.organization.id, userId: identity.user.id },
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity.organization.id},0))`;
      if (
        await tx.auditEvent.findFirst({
          where: { action: 'showcase.empty.complete', requestId: record.id },
        })
      )
        return;
      if (
        (await tx.companyUser.count()) !== 1 ||
        (await tx.location.count()) ||
        (await tx.product.count()) ||
        (await tx.order.count())
      )
        throw new Error('Compania goală are date incompatibile. Nu le șterg.');
      await tx.auditEvent.create({
        data: {
          organizationId: identity.organization.id,
          actorPlatformAdminId: record.platform.id,
          action: 'showcase.empty.complete',
          targetType: 'ORGANIZATION',
          targetId: identity.organization.id,
          outcome: 'SUCCESS',
          requestId: record.id,
          metadata: { synthetic: true, adminOnly: true },
        },
      });
    },
  );
}
