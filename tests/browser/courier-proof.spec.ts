import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { courierWorkFixture } from './support/courier-work-fixture';
import { api, navigateSection } from './support/browser-helpers';
import { completePacking } from './support/complete-packing';
test('curier mobil: dovadă semnată, răspuns pierdut, reload și istoric', async ({ browser }) => {
  const f = await courierWorkFixture(browser, 0, 1),
    page = f.admin,
    id = f.orderIds[0]!;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    const detail = (
      await (await api(page, `/courier-work/${id}?locationId=${f.location.id}`)).json()
    ).order;
    expect(
      (
        await api(page, `/courier-work/${id}/accept`, {
          locationId: f.location.id,
          assignmentId: detail.assignmentId,
          orderVersion: detail.orderVersion,
          requestKey: randomUUID(),
          confirmed: true,
        })
      ).status(),
    ).toBe(200);
    const sent = await (
      await api(page, `/orders/${id}/send`, {
        version: detail.orderVersion,
        requestKey: randomUUID(),
      })
    ).json();
    for (const [index, status] of ['PREPARING', 'READY'].entries())
      expect(
        (
          await api(
            page,
            `/kitchen/tickets/${sent.ticket.id}`,
            { version: index + 1, status },
            'PATCH',
          )
        ).status(),
      ).toBe(200);
    await completePacking(page, id);
    for (const status of ['PICKED_UP', 'DELIVERING']) {
      const current = (await (await api(page, `/orders/${id}`)).json()).order;
      expect(
        (
          await api(page, `/orders/${id}/delivery`, {
            version: current.version,
            requestKey: randomUUID(),
            status,
          })
        ).status(),
      ).toBe(200);
    }
    await navigateSection(page, 'Livrările mele');
    await page.getByRole('button', { name: 'Detalii livrare', exact: true }).click();
    const dialog = page.getByRole('dialog'),
      submit = dialog.getByRole('button', { name: 'Confirmă predarea livrării', exact: true });
    await expect(submit).toBeDisabled();
    await dialog
      .getByLabel('Numele destinatarului', { exact: true })
      .fill('Destinatar browser sintetic');
    await dialog.getByRole('checkbox').check();
    await expect(submit).toBeDisabled();
    const pad = dialog.getByRole('img', { name: 'Semnătura destinatarului', exact: true });
    const draw = async () => {
      await pad.scrollIntoViewIfNeeded();
      const box = (await pad.boundingBox())!;
      await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.4);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.8, { steps: 10 });
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2, { steps: 10 });
      await page.mouse.up();
    };
    await draw();
    await expect(submit).toBeEnabled();
    await dialog.getByRole('button', { name: 'Șterge semnătura', exact: true }).click();
    await expect(submit).toBeDisabled();
    await draw();
    await page.screenshot({
      path: '.local/horeca-crm-delivery-verification/courier-proof-390.png',
      fullPage: true,
    });
    await page.route(
      `**/api/tenant/orders/${id}/delivery`,
      async (route) => {
        expect((await route.fetch()).status()).toBe(200);
        await route.abort();
      },
      { times: 1 },
    );
    await submit.click();
    await expect(
      dialog.getByRole('button', { name: 'Verifică tentativa de livrare', exact: true }),
    ).toBeVisible();
    await expect(dialog.getByLabel('Numele destinatarului', { exact: true })).toBeDisabled();
    const saved = await page.evaluate(() =>
      Object.entries(sessionStorage)
        .filter(([key]) => key.startsWith('pos.courier-transition:'))
        .map(([, value]) => value)
        .join(''),
    );
    expect(saved).toContain('DELIVERED');
    for (const forbidden of [
      'Destinatar browser',
      'signature',
      'recipientName',
      'version',
      'proof',
    ])
      expect(saved).not.toContain(forbidden);
    await page.reload();
    await page.getByLabel('Context', { exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Livrările mele');
    await page.getByRole('button', { name: 'Verifică tentativa de livrare', exact: true }).click();
    await expect(
      page.getByText('Starea livrării a fost confirmată.', { exact: true }),
    ).toBeVisible();
    await page.getByLabel('Lista livrărilor', { exact: true }).selectOption('HISTORY');
    await expect(page.getByText('Livrată', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Detalii livrare', exact: true }).click();
    await expect(
      dialog.getByText(/Predare confirmată cu semnătură: Destinatar browser sintetic/),
    ).toBeVisible();
    await expect(dialog.getByText(/De încasat:/)).toBeVisible();
  } finally {
    await f.dispose();
  }
});
