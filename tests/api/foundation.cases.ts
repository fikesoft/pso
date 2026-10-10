import { it } from 'vitest';
import { prepareFoundationScenario } from './foundation-setup';
import { verifyFoundationScenario } from './foundation-verification';

export function registerFoundationTests() {
  it(
    'flux complet: provisioning privat → MFA → Ana → lucrător → limite, DENY și revocare',
    async () => verifyFoundationScenario(await prepareFoundationScenario()),
    30_000,
  );
}
