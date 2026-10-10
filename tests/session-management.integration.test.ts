import './api/support/harness';
import { it } from 'vitest';
import { prepareFoundationScenario } from './api/foundation-setup';
import { verifySessionManagement } from './api/session-management.cases';

it('sesiunile active respectă tenantul, delegarea, MFA și revocarea imediată', async () => {
  const fixture = await prepareFoundationScenario();
  await verifySessionManagement(fixture);
}, 90_000);
