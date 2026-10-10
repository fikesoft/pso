import { beforeAll, afterAll, it } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
import type { OperationsFixture } from './api/operations.types';
import { verifyDraftSnapshots, verifySendAndPreparation } from './api/operations-order.cases';
import { verifyOperationalAccess } from './api/operations-access.cases';
import { verifyOperationPagination } from './api/operations-pagination.cases';

let fixture: OperationsFixture;
beforeAll(async () => {
  fixture = await prepareOperations();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});
it('catalogul și comenzile respectă locația, compania și permisiunile independente', async () => {
  await verifyOperationalAccess(fixture);
});
it('ciornele păstrează prețurile exacte, idempotenta și versiunile concurente', async () => {
  await verifyDraftSnapshots(fixture);
});
it('ticketul unic păstrează snapshotul și permite numai avansarea preparării', async () => {
  await verifySendAndPreparation(fixture);
});
it('paginarea păstrează ordinea și jurnalul în locația autorizată', async () => {
  await verifyOperationPagination(fixture);
});
