import { assertRuntimeDatabaseRole } from '../../../packages/db/src/index';
import { provisionCompanies } from './provision';
import { markEmptyCompany, seedBase } from './base';
import { openSeedLocation } from './location';
import { seedLocationOrders } from './orders';
import type { SeedClients, SeedRecord } from './seed.types';

export async function runShowcaseSeed(clients: SeedClients, record: SeedRecord, base: string) {
  await assertRuntimeDatabaseRole(clients.runtime);
  const [full, empty] = await provisionCompanies(clients, record);
  await markEmptyCompany(clients, record, empty!);
  const references = await seedBase(clients, record, full!);
  for (const locationIndex of references.locationIds.keys()) {
    const location = await openSeedLocation(record, references, locationIndex, base);
    try {
      await seedLocationOrders(clients, location.context);
      console.log(
        `DEMO · locația ${locationIndex + 1}/3: catalog, inventar, clienți și comenzi confirmate.`,
      );
    } finally {
      await location.close();
    }
  }
  return { references, empty: empty! };
}
