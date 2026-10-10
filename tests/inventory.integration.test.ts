import { afterAll, beforeAll, it } from 'vitest';
import { closeOperations } from './api/operations-setup';
import { prepareInventory } from './api/inventory-setup';
import type { InventoryFixture } from './api/inventory.types';
import { verifyInventoryAccess } from './api/inventory-access.cases';
import { verifyInventoryBounds, verifyInventoryDocuments } from './api/inventory-document.cases';
import {
  verifyInventoryConsumption,
  verifyInventoryRecipes,
} from './api/inventory-consumption.cases';
import {
  verifyInventoryPagination,
  verifyInventoryReplayAuthorization,
} from './api/inventory-pagination.cases';
import { verifyInventoryCapacity } from './api/inventory-capacity.cases';
import { verifyInventoryCompetingCheckouts } from './api/inventory-lifecycle.cases';

let fixture: InventoryFixture;
beforeAll(async () => {
  fixture = await prepareInventory();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});
it('inventarul separă metadatele globale, soldurile locale, DENY și tenanturile', async () => {
  await verifyInventoryAccess(fixture);
});
it('intrările, pierderile și inventarierile sunt exacte, idempotente și rezistă concurenței', async () => {
  await verifyInventoryDocuments(fixture);
});
it('rezervarea la trimitere și consumul la finalizare respectă rețeta și servirea, permite sold negativ și nu se dublează', async () => {
  await verifyInventoryConsumption(fixture);
});
it('versiunile și arhivarea păstrează istoricul; o rețetă goală oprește numai consumul viitor', async () => {
  await verifyInventoryRecipes(fixture);
});
it('limitele cantitative și un consum invalid retrag atomic finalizarea, păstrând rezervările', async () => {
  await verifyInventoryBounds(fixture);
});
it('paginarea articolelor, produselor și mișcărilor este completă și izolată', async () => {
  await verifyInventoryPagination(fixture);
});
it('reîncercările recitesc autorizarea după revocare', async () => {
  await verifyInventoryReplayAuthorization(fixture);
});
it('50 linii × 50 componente rezervă și apoi consumă 2500 componente o singură dată în limita tranzacției', async () => {
  await verifyInventoryCapacity(fixture);
});
it('checkouturile concurente cu chei diferite produc o singură plată și un singur consum', async () => {
  await verifyInventoryCompetingCheckouts(fixture);
});
