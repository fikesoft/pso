import { randomUUID } from 'node:crypto';
import type { CashShiftDto } from '../../packages/contracts/src/cash-shifts';
import { BrowserSession, fixturePasswords } from './support/harness';

/** Explicit financial precondition; callers retain the returned id in their command body. */
export function cashShiftFixture(admin: BrowserSession, defaultLocationId: string) {
  const opened = new WeakMap<BrowserSession, Map<string, Promise<CashShiftDto>>>();
  return (actor = admin, locationId = defaultLocationId, openingAmount = '100.00') => {
    let locations = opened.get(actor);
    if (!locations) {
      locations = new Map();
      opened.set(actor, locations);
    }
    let pending = locations.get(locationId);
    if (!pending) {
      pending = openCashShift(admin, actor, locationId, openingAmount);
      locations.set(locationId, pending);
    }
    return pending;
  };
}

export async function openCashShift(
  admin: BrowserSession,
  actor: BrowserSession,
  locationId: string,
  openingAmount = '100.00',
): Promise<CashShiftDto> {
  const { register } = await admin.expect('/cash-registers', 'POST', {
    locationId,
    requestKey: randomUUID(),
    code: `QA-${randomUUID().slice(0, 8)}`,
    name: 'Casă pentru operațiuni financiare sintetice',
  });
  const { shift } = await actor.expect(`/cash-registers/${register.id}/open`, 'POST', {
    locationId,
    requestKey: randomUUID(),
    openingAmount,
  });
  return shift;
}

export async function cashActorWithoutCollection(
  admin: BrowserSession,
  locationId: string,
  companySlug: string,
) {
  const { role } = await admin.expect('/roles', 'POST', {
    name: 'Cititor fără drept de încasare',
    permissions: ['orders.read', 'cash.registers.read', 'cash.shifts.read', 'cash.shifts.open'].map(
      (permission) => ({ permission }),
    ),
  });
  const { pin } = await admin.expect('/staff', 'POST', {
    login: `cash-negative-${randomUUID().slice(0, 8)}`,
    displayName: 'Actor financiar fără collect',
    authenticationMethod: 'PIN',
    locationIds: [locationId],
    assignments: [{ roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId }],
  });
  fixturePasswords.add(pin);
  const actor = new BrowserSession('TENANT');
  await actor.expect('/auth/session');
  await actor.expect('/auth/pin', 'POST', { companySlug, pin });
  return actor;
}
