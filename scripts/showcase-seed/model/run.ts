import { assertRuntimeDatabaseRole, withTenantTransaction } from '../../../packages/db/src/index';
import { provisionCompanies } from './provision';
import { markEmptyCompany, seedBase } from './base';
import { openSeedLocation } from './location';
import { seedLocationOrders } from './orders';
import { seedOrderKeys } from './record';
import type { SeedClients, SeedRecord } from './seed.types';

export async function runShowcaseSeed(clients: SeedClients, record: SeedRecord, base: string) {
  await assertRuntimeDatabaseRole(clients.runtime);
  const [full, empty] = await provisionCompanies(clients, record);
  await markEmptyCompany(clients, record, empty!);
  const references = await seedBase(clients, record, full!);
  const locations = await Promise.allSettled(
    Array.from(references.locationIds.keys(), async (locationIndex) => {
      const keys = seedOrderKeys(record, locationIndex);
      const completed = await withTenantTransaction(
        clients.runtime,
        { organizationId: references.organizationId },
        (tx) =>
          tx.auditEvent.count({
            where: { action: 'showcase.order.complete', requestId: { in: keys } },
          }),
        { readOnlySnapshot: true },
      );
      if (completed === keys.length) return;
      const location = await openSeedLocation(record, references, locationIndex, base);
      try {
        await seedLocationOrders(clients, location.context);
        console.log(
          `DEMO · locația ${locationIndex + 1}/3: catalog, inventar, clienți și comenzi confirmate.`,
        );
      } finally {
        await location.close();
      }
    }),
  );
  // Each location owns distinct cash shifts, stock balances and operational users.
  // Wait for every location to settle before closing the shared private API.
  const failure = locations.find((location) => location.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return { references, empty: empty! };
}
