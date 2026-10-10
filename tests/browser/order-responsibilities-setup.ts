import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { cashShiftsFixture } from './cash-shifts-setup';
import { navigateSection } from './support/browser-helpers';

export async function responsibilitiesFixture(browser: Browser) {
  const f = await cashShiftsFixture(browser);
  try {
    const permissions = [
      'orders.read',
      'orders.create',
      'orders.handoff',
      'cash.registers.read',
      'cash.shifts.read',
      'cash.shifts.open',
      'cash.shifts.close',
      'payments.collect',
      'payments.refund',
    ];
    for (const name of ['outgoing', 'incoming']) {
      const { role } = await f.request('/roles', {
        name: `E2E responsabilitate ${name}`,
        permissions: permissions.map((permission) => ({ permission })),
      });
      f.actors[name] = await f.request('/staff', {
        login: `responsibility-${name}`,
        displayName: `Responsabil ${name}`,
        authenticationMethod: 'PIN',
        locationIds: [f.location.id],
        assignments: [
          { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.location.id },
        ],
      });
    }
    const responsibility = (orderId: string, actor = f.admin) =>
      f.request(`/orders/${orderId}/responsibility?locationId=${f.location.id}`, undefined, actor);
    const history = (orderId: string, actor = f.admin) =>
      f.request(
        `/orders/${orderId}/responsibility-events?locationId=${f.location.id}`,
        undefined,
        actor,
      );
    const command = async (orderId: string, actor: Page, changes: Record<string, unknown>) => {
      const current = await responsibility(orderId, actor);
      const body = {
        locationId: f.location.id,
        requestKey: randomUUID(),
        orderVersion: current.order.version,
        responsibilityVersion: current.responsibility.version,
        reason: 'Responsabilitate sintetică explicită',
        ...changes,
      };
      return {
        body,
        ...(await f.request(`/orders/${orderId}/responsibility-commands`, body, actor)),
      };
    };
    const reopen = async (registerId: string, actor: Page) =>
      (
        await f.request(
          `/cash-registers/${registerId}/open`,
          { locationId: f.location.id, requestKey: randomUUID(), openingAmount: '0' },
          actor,
        )
      ).shift;
    return { ...f, responsibility, history, command, reopen };
  } catch (error) {
    await f.dispose();
    throw error;
  }
}

export function responsibilityQueue(page: Page) {
  return page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Responsabilitatea comenzilor', exact: true }),
  });
}

export async function openResponsibility(
  page: Page,
  orderNumber: number,
  shiftId?: string,
  view = 'UNASSIGNED',
) {
  await navigateSection(page, 'Case');
  const queue = responsibilityQueue(page);
  await queue.getByLabel('Coada de responsabilități', { exact: true }).selectOption(view);
  if (shiftId) await queue.getByLabel('Tura responsabilă', { exact: true }).selectOption(shiftId);
  const card = queue
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: `Comanda #${orderNumber}`, exact: true }) });
  await card.getByRole('button', { name: 'Detaliile comenzii', exact: true }).click();
  const detail = page.getByRole('dialog', { name: `Comanda #${orderNumber}`, exact: true });
  await expect(detail).toBeVisible();
  return detail;
}

export async function responsibilityForm(
  page: Page,
  kind: 'ASSIGN' | 'PREPARE_HANDOFF' | 'ACCEPT_HANDOFF',
  reason = 'Motiv operațional fără persistare locală',
) {
  const detail = page.getByRole('dialog');
  const name =
    kind === 'ASSIGN'
      ? 'Asumă în tura mea'
      : kind === 'PREPARE_HANDOFF'
        ? 'Pregătește predarea'
        : 'Acceptă responsabilitatea';
  await detail.getByRole('button', { name, exact: true }).click();
  await detail.getByLabel('Motivul responsabilității', { exact: true }).fill(reason);
  await detail.getByLabel('Confirm operația de responsabilitate afișată', { exact: true }).check();
  return { detail, submit: detail.getByRole('button', { name, exact: true }) };
}

export function responsibilityPointers(page: Page) {
  return page.evaluate(() =>
    Object.entries(sessionStorage)
      .filter(([key]) => key.startsWith('pos.order-responsibility:'))
      .map(([key, value]) => ({ key, value: JSON.parse(value) })),
  );
}
