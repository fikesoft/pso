import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { cashShiftsFixture, shiftCard } from './cash-shifts-setup';
import { navigateSection } from './support/browser-helpers';

export async function cashMovementsFixture(browser: Browser) {
  const f = await cashShiftsFixture(browser);
  try {
    for (const [name, permissions] of Object.entries({
      movement: [
        'cash.registers.read',
        'cash.shifts.read',
        'cash.shifts.open',
        'cash.shifts.close',
        'cash.movements.create',
      ],
      reporter: ['cash.registers.read', 'cash.shifts.read', 'cash.reports.read'],
    })) {
      const { role } = await f.request('/roles', {
        name: `E2E ${name}`,
        permissions: permissions.map((permission) => ({ permission })),
      });
      f.actors[name] = await f.request('/staff', {
        login: `cash-${name}`,
        displayName: `Operator ${name}`,
        authenticationMethod: 'PIN',
        locationIds: [f.location.id],
        assignments: [
          { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.location.id },
        ],
      });
    }
    const move = async (id: string, page: Page, changes: Record<string, unknown> = {}) => {
      const current = await f.detail(id, page);
      return f.request(
        `/cash-shifts/${id}/movements`,
        {
          locationId: f.location.id,
          version: current.shift.version,
          requestKey: randomUUID(),
          direction: 'IN',
          amount: '5',
          reason: 'Motiv sintetic de numerar',
          ...changes,
        },
        page,
      );
    };
    return { ...f, move };
  } catch (error) {
    await f.dispose();
    throw error;
  }
}

export async function movementDetail(page: Page, code: string) {
  await navigateSection(page, 'Case');
  await shiftCard(page, code).getByRole('button', { name: 'Detaliile turei', exact: true }).click();
  return page.getByRole('dialog', { name: 'Detaliile turei', exact: true });
}

export async function movementForm(
  page: Page,
  direction: 'IN' | 'OUT',
  amount = '7',
  reason = 'Motiv privat al mișcării',
) {
  const name = direction === 'IN' ? 'Introdu numerar' : 'Retrage numerar';
  await page
    .getByRole('dialog', { name: 'Detaliile turei', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
  const form = page.getByRole('dialog', { name, exact: true });
  await form.getByLabel('Sumă (MDL)', { exact: true }).fill(amount);
  await form.getByLabel('Motivul mișcării', { exact: true }).fill(reason);
  if (direction === 'OUT')
    await form
      .getByLabel('Confirm retragerea numerarului din această tură', { exact: true })
      .check();
  return form;
}

export async function enterDiscrepancyDates(page: Page, date: string) {
  await page.getByLabel('Închideri de la', { exact: true }).fill(date);
  await page.getByLabel('Închideri până la', { exact: true }).fill(date);
  await page.getByRole('button', { name: 'Aplică filtrele', exact: true }).click();
  await expect(page.getByLabel('Casa din raport', { exact: true })).toBeEnabled();
}
