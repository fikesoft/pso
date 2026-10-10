import { afterAll, beforeAll, it } from 'vitest';
import { closeOperations } from './api/operations-setup';
import { prepareWebsite } from './api/website-setup';
import type { WebsiteFixture } from './api/website.types';
import { verifyWebsiteReceiving, verifyWebsitePriceAndReplay } from './api/website-receive.cases';
import { verifyWebsiteKeyGuards, verifyWebsiteScope } from './api/website-access.cases';
import {
  verifyWebsiteDecisions,
  verifyWebsitePaginationAndAvailability,
} from './api/website-decision.cases';
import { verifyWebsiteLiveAccess } from './api/website-live-access.cases';

let fixture: WebsiteFixture;
beforeAll(async () => {
  fixture = await prepareWebsite();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});
it('website primește confirmarea după persistare, deduplică și separă datele private', async () => {
  await verifyWebsiteReceiving(fixture);
});
it('cheile sunt numai pentru backend, revocabile și legate de conexiunea activă', async () => {
  await verifyWebsiteKeyGuards(fixture);
});
it('izolarea companiei, locației și drepturilor rezistă cererilor directe', async () => {
  await verifyWebsiteScope(fixture);
});
it('prețul serverului cere reconfirmare iar retry și acceptarea păstrează snapshotul', async () => {
  await verifyWebsitePriceAndReplay(fixture);
});
it('deciziile concurente creează o singură ciornă cu operator real și fără date private în bucătărie', async () => {
  await verifyWebsiteDecisions(fixture);
});
it('paginarea este stabilă iar produsele indisponibile nu intră automat în preparare', async () => {
  await verifyWebsitePaginationAndAvailability(fixture);
});
it('revocarea cheii în timpul cererii și retragerea drepturilor blochează chiar și retry', async () => {
  await verifyWebsiteLiveAccess(fixture);
});
