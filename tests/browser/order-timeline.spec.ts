import { completePacking } from './support/complete-packing';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, navigateSection, noOverflow, session, submit } from './support/browser-helpers';

test('cronologie: comandă, bucătărie, livrare, încasare și rambursare actualizate și persistente pe mobil', async ({
  browser,
}, info) => {
  const f = await operationsFixture(browser);
  const { admin, location } = f;
  try {
    const shift = await f.cashShift(f.admin, f.location.id, '0');
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await createOperationalProduct(admin);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Comandă nouă', exact: true }).click();
    const draft = admin.getByRole('dialog', { name: 'Ciornă comandă', exact: true });
    await draft.getByLabel('Tip de servire', { exact: true }).selectOption('DELIVERY');
    await draft.getByRole('button', { name: /Cafea sintetică/ }).click();
    const created = await submit(
      admin,
      '/api/tenant/orders',
      draft.getByRole('button', { name: 'Salvează ciorna', exact: true }),
    );
    const path = `/api/tenant/orders/${created.order.id}`;
    const dialog = admin.getByRole('dialog', { name: 'Comanda #1', exact: true });
    const timeline = dialog.getByRole('region', { name: 'Cronologia comenzii', exact: true });
    await dialog.getByTestId('order-timeline').locator('summary').click();
    const events = timeline.getByTestId('order-timeline-event');
    await expect(events).toHaveCount(1);
    await expect(events.first()).toContainText('Comandă creată');
    await expect(events.first().locator('time')).toHaveAttribute('datetime', /T/);
    await expect(events.first()).toContainText('Versiunea comenzii: 1');
    await submit(
      admin,
      `${path}/confirm`,
      dialog.getByRole('button', { name: 'Confirmă fără trimitere', exact: true }),
    );
    await expect(events).toHaveCount(2);
    await expect(events.first()).toContainText('Confirmată');
    const delivery = dialog.getByRole('region', { name: 'Livrare', exact: true });
    await delivery
      .getByRole('combobox', { name: 'Curier', exact: true })
      .selectOption((await session(admin)).user.id);
    await submit(
      admin,
      `${path}/delivery`,
      delivery.getByRole('button', { name: 'Actualizează livrarea', exact: true }),
    );
    await expect(events.first()).toContainText('Livrare actualizată');
    await expect(events.first()).toContainText('Curier:');
    await submit(
      admin,
      `${path}/send`,
      dialog.getByRole('button', { name: 'Trimite la bucătărie', exact: true }),
    );
    await expect(events.first()).toContainText('Starea bucătăriei modificată');
    await admin.keyboard.press('Escape');
    await navigateSection(admin, 'Bucătărie');
    const ticket = admin.locator('article').filter({
      has: admin.getByRole('heading', { name: 'Comanda #1', exact: true }),
    });
    // A live read must not supersede the confirmation read and unlock a stale ticket.
    let partialCommitted = false;
    let partialReads = 0;
    await admin.route('**/api/tenant/kitchen/tickets/**', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const response = await route.fetch();
      if (route.request().postDataJSON().status === 'PARTIALLY_READY') partialCommitted = true;
      await route.fulfill({ response });
    });
    await admin.route('**/api/tenant/kitchen/tickets?*', async (route) => {
      const status = new URL(route.request().url()).searchParams.get('status');
      if (!partialCommitted || status !== 'PARTIALLY_READY') return route.continue();
      const index = ++partialReads;
      const response = await route.fetch();
      if (index <= 2) await new Promise((resolve) => setTimeout(resolve, index === 1 ? 400 : 1000));
      await route.fulfill({ response });
    });
    for (const label of ['Începe prepararea', 'Marchează parțial gata', 'Marchează gata']) {
      const updated = admin.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' && response.url().includes('/kitchen/tickets/'),
      );
      await ticket.getByRole('button', { name: label, exact: true }).click();
      expect((await updated).status()).toBe(200);
    }
    await expect(
      admin
        .getByRole('region', { name: 'Gata în bucătărie', exact: true })
        .getByRole('heading', { name: 'Comanda #1', exact: true }),
    ).toBeVisible();
    await completePacking(admin, created.order.id);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    await dialog.getByTestId('order-timeline').locator('summary').click();
    await expect(timeline).toContainText('Pregătită parțial');
    for (const status of ['PICKED_UP', 'DELIVERING', 'DELIVERED']) {
      await delivery
        .getByRole('combobox', { name: 'Starea următoare', exact: true })
        .selectOption(status);
      await submit(
        admin,
        `${path}/delivery`,
        delivery.getByRole('button', { name: 'Actualizează livrarea', exact: true }),
      );
    }
    await expect(events.first()).toContainText('Livrată');
    await submit(
      admin,
      `${path}/complete`,
      dialog.getByRole('button', { name: 'Finalizează comanda', exact: true }),
    );
    await expect(events.first()).toContainText('Finalizată');
    const financial = dialog.getByRole('region', { name: 'Plăți și rambursări', exact: true });
    await financial.getByRole('button', { name: 'Încasează o tranșă', exact: true }).click();
    await financial
      .getByLabel('Tura proprie pentru operație', { exact: true })
      .selectOption(shift.id);
    await financial.getByLabel('Metoda tranșei', { exact: true }).selectOption('CARD');
    await financial
      .getByLabel('Confirm că aceste sume au fost deja primite', { exact: true })
      .check();
    await submit(
      admin,
      `${path}/payments`,
      financial.getByRole('button', { name: 'Înregistrează tranșa', exact: true }),
    );
    await expect(events.first()).toContainText('Plată înregistrată');
    await expect(events.first()).toContainText('10.01 MDL');
    await financial.getByText('Încasări originale', { exact: true }).click();
    await financial.getByRole('button', { name: 'Rambursează', exact: true }).click();
    await financial
      .getByLabel('Tura proprie pentru operație', { exact: true })
      .selectOption(shift.id);
    await financial.getByLabel('Suma rambursată (MDL)', { exact: true }).fill('1.01');
    await financial
      .getByLabel('Motivul rambursării', { exact: true })
      .fill('Retur vizibil în cronologie');
    await financial
      .getByLabel('Confirm că suma a fost deja restituită prin metoda plății originale', {
        exact: true,
      })
      .check();
    await submit(
      admin,
      `${path}/refunds`,
      financial.getByRole('button', { name: 'Înregistrează rambursarea', exact: true }),
    );
    await expect(events.first()).toContainText('Rambursare înregistrată');
    await expect(events.first()).toContainText('Retur vizibil în cronologie');
    await expect(events.first()).toContainText('1.01 MDL');
    const count = await events.count();
    await timeline.getByRole('button', { name: 'Reîncarcă cronologia', exact: true }).click();
    await expect(events).toHaveCount(count);
    await admin.setViewportSize({ width: 360, height: 800 });
    await events.first().scrollIntoViewIfNeeded();
    await noOverflow(admin);
    await admin.screenshot({ path: info.outputPath('order-timeline-360.png'), fullPage: true });
    await admin.keyboard.press('Escape');
    await admin.reload();
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    await dialog.getByTestId('order-timeline').locator('summary').click();
    await expect(events).toHaveCount(count);
    await expect(events.first()).toContainText('Retur vizibil în cronologie');
    await expect(events.last()).toContainText('Comandă creată');
    await noOverflow(admin);
  } finally {
    await f.dispose();
  }
});

test('cronologie: paginarea adaugă evenimentele vechi fără duplicate și păstrează istoricul după editare', async ({
  browser,
}) => {
  const f = await operationsFixture(browser);
  const { admin, location } = f;
  try {
    await admin.getByRole('combobox', { name: 'Context', exact: true }).selectOption(location.id);
    const product = await createOperationalProduct(admin);
    const created = await api(admin, '/orders', {
      locationId: location.id,
      serviceType: 'PICKUP',
      requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: '1' }],
    });
    expect(created.status()).toBe(200);
    let order = (await created.json()).order;
    for (let index = 0; index < 51; index++) {
      const edited = await api(
        admin,
        `/orders/${order.id}`,
        {
          version: order.version,
          serviceType: 'PICKUP',
          items: [{ id: order.items[0].id, productId: product.id, quantity: '1' }],
        },
        'PATCH',
      );
      expect(edited.status()).toBe(200);
      order = (await edited.json()).order;
    }
    await navigateSection(admin, 'Comenzi');
    await admin.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: 'Comanda #1', exact: true });
    await dialog.getByTestId('order-timeline').locator('summary').click();
    const timeline = dialog.getByRole('region', { name: 'Cronologia comenzii', exact: true });
    const events = timeline.getByTestId('order-timeline-event');
    await expect(events).toHaveCount(50);
    await expect(events.first()).toContainText('Versiunea comenzii: 52');
    await timeline.getByRole('button', { name: 'Mai multe evenimente', exact: true }).click();
    await expect(events).toHaveCount(52);
    await expect(events.last()).toContainText('Comandă creată');
    await expect(
      timeline.getByRole('button', { name: 'Mai multe evenimente', exact: true }),
    ).toHaveCount(0);
    const versions = await events
      .locator('p')
      .filter({ hasText: 'Versiunea comenzii:' })
      .allTextContents();
    expect(new Set(versions).size).toBe(52);
  } finally {
    await f.dispose();
  }
});
