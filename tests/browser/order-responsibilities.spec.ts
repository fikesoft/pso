import { test, expect } from '@playwright/test';
import {
  responsibilitiesFixture,
  openResponsibility,
  responsibilityForm,
  responsibilityQueue,
} from './order-responsibilities-setup';
import { submit, navigateSection } from './support/browser-helpers';

test('responsabilitate: asumare și predare nominală între două ture, fără mutație financiară implicită', async ({
  browser,
}, info) => {
  const f = await responsibilitiesFixture(browser);
  try {
    const outgoing = await f.login('outgoing');
    const incoming = await f.login('incoming');
    const opened = await f.open(
      outgoing,
      '0',
      'Casă cu denumire lungă pentru predarea responsabilității',
    );
    const other = await f.open(outgoing, '0', 'A doua tură proprie');
    const order = await f.order(false, '20');
    await openResponsibility(outgoing, order.number, opened.shift.id);
    let form = await responsibilityForm(outgoing, 'ASSIGN');
    const path = `/api/tenant/orders/${order.id}/responsibility-commands`;
    for (const width of [1440, 768, 390, 360]) {
      await outgoing.setViewportSize({ width, height: 900 });
      const reason = form.detail.getByLabel('Motivul responsabilității', { exact: true });
      await reason.focus();
      await outgoing.keyboard.press('Tab');
      await expect(
        form.detail.getByLabel('Confirm operația de responsabilitate afișată', { exact: true }),
      ).toBeFocused();
      expect(
        await outgoing.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await outgoing.screenshot({
        path: info.outputPath(`responsibility-form-${width}.png`),
        fullPage: true,
      });
    }
    await form.detail.getByRole('button', { name: 'Renunță la formular', exact: true }).click();
    expect((await f.history(order.id)).events).toEqual([]);
    form = await responsibilityForm(outgoing, 'ASSIGN');
    const assigned = await submit(outgoing, path, form.submit);
    expect(assigned.event.targetShift.id).toBe(opened.shift.id);
    expect((await f.detail(other.shift.id, outgoing)).shift.version).toBe(1);
    form = await responsibilityForm(outgoing, 'PREPARE_HANDOFF');
    await expect(form.detail.getByText(/Responsabilul actual rămâne nominal/)).toBeVisible();
    const prepared = await submit(outgoing, path, form.submit);
    await outgoing.keyboard.press('Escape');
    await f.close(opened.shift.id, outgoing);
    await f.open(incoming, '0', 'Prima tură incoming pe registru nepotrivit');
    await f.request(
      `/cash-registers/${opened.register.id}`,
      {
        locationId: f.location.id,
        version: 1,
        requestKey: crypto.randomUUID(),
        name: 'Denumire nouă pentru tura incoming',
      },
      f.admin,
      'PATCH',
    );
    const target = await f.reopen(opened.register.id, incoming);
    await openResponsibility(incoming, order.number, target.id, 'INCOMING');
    form = await responsibilityForm(incoming, 'ACCEPT_HANDOFF');
    const accepted = await submit(incoming, path, form.submit);
    expect(accepted.event.sourceShift.registerName).toBe(opened.shift.registerName);
    expect(accepted.event.targetShift.registerName).toBe('Denumire nouă pentru tura incoming');
    expect(accepted.event).toMatchObject({
      handoffEventId: prepared.event.eventId,
      toOwner: { userId: f.actors.incoming!.user.id },
      targetShift: { id: target.id },
    });
    const panel = form.detail.getByRole('region', {
      name: 'Responsabilitatea comenzilor',
      exact: true,
    });
    await expect(panel.getByText('Responsabil incoming', { exact: false }).first()).toBeVisible();
    await panel.getByText('Istoricul responsabilității', { exact: true }).click();
    await expect(panel.getByText('Predare acceptată', { exact: true })).toBeVisible();
    await incoming.setViewportSize({ width: 360, height: 900 });
    await incoming.screenshot({
      path: info.outputPath('responsibility-history-360.png'),
      fullPage: true,
    });
    expect((await f.detail(target.id, incoming)).summary.expectedCash).toBe('0.00');
    expect((await f.history(order.id)).events).toHaveLength(3);
  } finally {
    await f.dispose();
  }
});

test('responsabilitate manager: owner dezactivat este predat explicit de manager, fără schimbarea nominală înainte de acceptare', async ({
  browser,
}) => {
  const f = await responsibilitiesFixture(browser);
  try {
    const outgoing = await f.login('outgoing');
    const opened = await f.open(outgoing, '0');
    const order = await f.order(false, '20');
    await f.command(order.id, outgoing, { kind: 'ASSIGN', targetShiftId: opened.shift.id });
    const { users } = await f.request('/staff');
    const owner = users.find((entry: { id: string }) => entry.id === f.actors.outgoing!.user.id);
    await f.request(
      `/staff/${owner.id}`,
      { version: owner.version, status: 'DISABLED' },
      f.admin,
      'PATCH',
    );
    await f.admin
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.location.id);
    await navigateSection(f.admin, 'Case');
    const queue = responsibilityQueue(f.admin);
    await queue.getByLabel('Coada de responsabilități', { exact: true }).selectOption('ASSIGNED');
    await queue.getByLabel('Contextul turei', { exact: true }).selectOption('MANAGER');
    await queue.getByLabel('Tura responsabilă', { exact: true }).selectOption(opened.shift.id);
    await queue
      .getByRole('article')
      .filter({
        has: f.admin.getByRole('heading', { name: `Comanda #${order.number}`, exact: true }),
      })
      .getByRole('button', { name: 'Detaliile comenzii', exact: true })
      .click();
    const form = await responsibilityForm(f.admin, 'PREPARE_HANDOFF');
    const managerReason = form.detail.getByLabel('Motivul intervenției manageriale', {
      exact: true,
    });
    await expect(managerReason).toHaveAttribute('required', '');
    await managerReason.fill('Recuperarea comenzii după dezactivarea contului');
    const saved = await submit(
      f.admin,
      `/api/tenant/orders/${order.id}/responsibility-commands`,
      form.submit,
    );
    expect(saved.event.fromOwner.userId).toBe(owner.id);
    expect(saved.event.actorUserId).not.toBe(owner.id);
    expect((await f.responsibility(order.id)).responsibility).toMatchObject({
      state: 'PENDING_HANDOFF',
      owner: { userId: owner.id },
    });
  } finally {
    await f.dispose();
  }
});

test('responsabilitate refund: datoria redeschisă apare fără owner și cere asumare nouă explicită', async ({
  browser,
}) => {
  const f = await responsibilitiesFixture(browser);
  try {
    const page = await f.login('outgoing');
    const source = await f.open(page, '0');
    const order = await f.order(false, '20');
    await f.command(order.id, page, { kind: 'ASSIGN', targetShiftId: source.shift.id });
    const payout = await f.open(f.admin, '0');
    const paid = await f.request(`/orders/${order.id}/payments`, {
      version: order.version,
      requestKey: crypto.randomUUID(),
      cashShiftId: payout.shift.id,
      confirmed: true,
      payments: [{ method: 'CARD', amount: '20' }],
    });
    await f.close(source.shift.id, page);
    const frozen = await f.detail(source.shift.id);
    const ledger = await f.request(`/orders/${order.id}/payments`);
    await f.request(`/orders/${order.id}/refunds`, {
      version: paid.order.version,
      requestKey: crypto.randomUUID(),
      cashShiftId: payout.shift.id,
      confirmed: true,
      reason: 'Restituire care redeschide datoria',
      refunds: [{ paymentId: ledger.payments[0].id, amount: '5' }],
    });
    const next = await f.open(page, '0');
    const detail = await openResponsibility(page, order.number, next.shift.id);
    const panel = detail.getByRole('region', { name: 'Responsabilitatea comenzilor', exact: true });
    await expect(panel.getByText(/Restantă după rambursare/)).toBeVisible();
    await expect(panel.getByText(/Fără responsabil asumat/)).toBeVisible();
    await expect(panel.getByText('Rest de încasat: 5.00 MDL', { exact: true })).toBeVisible();
    const form = await responsibilityForm(page, 'ASSIGN');
    const saved = await submit(
      page,
      `/api/tenant/orders/${order.id}/responsibility-commands`,
      form.submit,
    );
    expect(saved.event.targetShift.id).toBe(next.shift.id);
    expect(await f.detail(source.shift.id)).toEqual(frozen);
  } finally {
    await f.dispose();
  }
});
