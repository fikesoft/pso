import { afterAll, beforeAll, it } from 'vitest';
import { closeOperations } from './api/operations-setup';
import { preparePinFixture } from './api/pin-setup';
import type { PinFixture } from './api/pin.types';
import { verifyPinLogin, verifyPinRotation } from './api/pin-login.cases';
import {
  verifyAdministrativePinRejection,
  verifyPinRequestGuards,
} from './api/pin-administration.cases';
import { verifyPinLivePolicy, verifyPinSessionLifecycle } from './api/pin-session.cases';
import { verifyPinResetScope } from './api/pin-reset-scope.cases';

let fixture: PinFixture;
beforeAll(async () => {
  fixture = await preparePinFixture();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});
it('PIN-ul identifică numai lucrătorul din compania selectată, fără parolă sau MFA', async () => {
  await verifyPinLogin(fixture);
});
it('resetarea PIN și dezactivarea retrag codul și sesiunile anterioare', async () => {
  await verifyPinRotation(fixture);
});
it('administratorii nu pot folosi PIN, iar promovarea cere parolă și MFA', async () => {
  await verifyAdministrativePinRejection(fixture);
});
it('logoutul și trecerea la parolă retrag sesiunile PIN', async () => {
  await verifyPinSessionLifecycle(fixture);
});
it('politica actuală blochează PIN-ul chiar dacă flagurile utilizatorului sunt vechi', async () => {
  await verifyPinLivePolicy(fixture);
});
it('resetarea PIN respectă compania, subordonarea și dreptul separat de resetare', async () => {
  await verifyPinResetScope(fixture);
});
it('loginul PIN păstrează Origin, CSRF, validarea strictă și limitarea încercărilor', async () => {
  await verifyPinRequestGuards(fixture);
});
