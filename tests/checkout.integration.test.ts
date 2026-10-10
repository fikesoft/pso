import { afterAll, beforeAll, it } from 'vitest';
import { closeOperations } from './api/operations-setup';
import { prepareCheckout } from './api/checkout-setup';
import type { CheckoutFixture } from './api/checkout.types';
import {
  verifyCardAndZero,
  verifyDemoCheckout,
  verifyManualCheckout,
  verifyReceiptSnapshot,
} from './api/checkout-success.cases';
import { verifyCheckoutAccess } from './api/checkout-access.cases';
import { verifyCheckoutRaces, verifyCheckoutState } from './api/checkout-state.cases';
import { verifyCheckoutKitchen } from './api/checkout-kitchen.cases';

let fixture: CheckoutFixture;
beforeAll(async () => {
  fixture = await prepareCheckout();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});
it('DEMO finalizează o singură dată, fără încasare sau bon fiscal', async () => {
  await verifyDemoCheckout(fixture);
});
it('numerarul confirmat înregistrează totalul exact o singură dată și restul corect', async () => {
  await verifyManualCheckout(fixture);
});
it('cardul manual și totalul zero produc evidențe distincte și exacte', async () => {
  await verifyCardAndZero(fixture);
});
it('checkout și reîncercările respectă drepturi, limite, DENY, locații și tenant', async () => {
  await verifyCheckoutAccess(fixture);
});
it('checkout cere preparare READY, versiune curentă și confirmare strictă', async () => {
  await verifyCheckoutState(fixture);
});
it('cererile concurente și cheile refolosite nu dublează închiderea sau plata', async () => {
  await verifyCheckoutRaces(fixture);
});
it('bucătăria exclude comenzile finalizate înainte de paginare și păstrează istoricul', async () => {
  await verifyCheckoutKitchen(fixture);
});
it('bonul păstrează snapshoturile după redenumirea produsului, companiei și casierului', async () => {
  await verifyReceiptSnapshot(fixture);
});
