import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CashShiftDto } from '../../../packages/contracts/src/cash-shifts';
import { api } from './browser-helpers';

/** Call explicitly before a financial scenario; this never rewrites a request. */
export function cashShiftFixture(admin: Page, defaultLocationId: string) {
  const opened = new WeakMap<Page, Map<string, Promise<CashShiftDto>>>();
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
  admin: Page,
  actor: Page,
  locationId: string,
  openingAmount = '100.00',
): Promise<CashShiftDto> {
  const created = await api(admin, '/cash-registers', {
    locationId,
    requestKey: randomUUID(),
    code: `QA-${randomUUID().slice(0, 8)}`,
    name: 'Casă sintetică pentru flux financiar',
  });
  expect(created.status()).toBe(200);
  const { register } = await created.json();
  const opened = await api(actor, `/cash-registers/${register.id}/open`, {
    locationId,
    requestKey: randomUUID(),
    openingAmount,
  });
  expect(opened.status()).toBe(200);
  return (await opened.json()).shift;
}
