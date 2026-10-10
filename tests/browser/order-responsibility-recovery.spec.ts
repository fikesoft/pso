import { test, expect } from '@playwright/test';
import {
  responsibilitiesFixture,
  openResponsibility,
  responsibilityForm,
  responsibilityPointers,
} from './order-responsibilities-setup';
import { navigateSection, submit, api } from './support/browser-helpers';

for (const kind of ['ASSIGN', 'PREPARE_HANDOFF', 'ACCEPT_HANDOFF'] as const)
  test(`responsabilitate recovery ${kind}: pierderea după commit păstrează corpul exact și reload rezolvă pointerul fără motive`, async ({
    browser,
  }) => {
    const f = await responsibilitiesFixture(browser);
    try {
      const outgoing = await f.login('outgoing');
      const incoming = await f.login('incoming');
      const opened = await f.open(outgoing, '0');
      const order = await f.order(false, '20');
      let page = outgoing;
      let targetId = opened.shift.id;
      if (kind !== 'ASSIGN')
        await f.command(order.id, outgoing, { kind: 'ASSIGN', targetShiftId: opened.shift.id });
      if (kind === 'ACCEPT_HANDOFF') {
        await f.command(order.id, outgoing, {
          kind: 'PREPARE_HANDOFF',
          sourceShiftId: opened.shift.id,
        });
        await f.close(opened.shift.id, outgoing);
        targetId = (await f.reopen(opened.register.id, incoming)).id;
        page = incoming;
      }
      await openResponsibility(
        page,
        order.number,
        targetId,
        kind === 'ASSIGN' ? 'UNASSIGNED' : kind === 'PREPARE_HANDOFF' ? 'ASSIGNED' : 'INCOMING',
      );
      const form = await responsibilityForm(page, kind);
      const path = `/api/tenant/orders/${order.id}/responsibility-commands`;
      const bodies: string[] = [];
      await page.route(`**${path}`, async (route) => {
        bodies.push(route.request().postData()!);
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('failed');
      });
      const failed = page.waitForEvent(
        'requestfailed',
        (request) => new URL(request.url()).pathname === path,
      );
      await form.submit.click();
      await failed;
      await expect(
        form.detail.getByLabel('Motivul responsabilității', { exact: true }),
      ).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(form.detail).toBeVisible();
      const payment = form.detail.getByRole('region', { name: 'Plăți și rambursări', exact: true });
      await expect(
        payment.getByRole('button', { name: 'Încasează o tranșă', exact: true }),
      ).toBeDisabled();
      const pointers = await responsibilityPointers(page);
      expect(pointers).toHaveLength(1);
      expect(Object.keys(pointers[0].value).sort()).toEqual([
        'actorUserId',
        'command',
        'locationId',
        'organizationId',
      ]);
      expect(pointers[0].value.command).toMatchObject({
        kind,
        orderId: order.id,
        locationId: f.location.id,
        requestKey: JSON.parse(bodies[0]!).requestKey,
      });
      expect(pointers[0].value.command).not.toHaveProperty('reason');
      expect(pointers[0].value.command).not.toHaveProperty('orderVersion');
      expect(JSON.stringify(pointers)).not.toContain('Motiv operațional');
      const repeated = page.waitForEvent(
        'requestfailed',
        (request) => new URL(request.url()).pathname === path,
      );
      await form.detail
        .getByRole('button', { name: 'Reîncearcă exact operația', exact: true })
        .click();
      await repeated;
      expect(bodies).toHaveLength(2);
      expect(bodies[1]).toBe(bodies[0]);
      await page.unroute(`**${path}`);
      await page.reload();
      await page
        .getByRole('combobox', { name: 'Context', exact: true })
        .selectOption(f.location.id);
      await navigateSection(page, 'Case');
      await expect(
        page.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }),
      ).toHaveCount(0);
      const result = await submit(
        page,
        `${path}/resolution`,
        page.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
      );
      expect(result.status).toBe('SUCCEEDED');
      expect(await responsibilityPointers(page)).toEqual([]);
      expect((await f.history(order.id)).events).toHaveLength(
        kind === 'ASSIGN' ? 1 : kind === 'PREPARE_HANDOFF' ? 2 : 3,
      );
    } finally {
      await f.dispose();
    }
  });

test('responsabilitate recovery: retragerea tentativei necomise refuză POST-ul întârziat și nu creează asumare', async ({
  browser,
}) => {
  const f = await responsibilitiesFixture(browser);
  try {
    const page = await f.login('outgoing');
    const { shift } = await f.open(page, '0');
    const order = await f.order(false, '20');
    await openResponsibility(page, order.number, shift.id);
    const form = await responsibilityForm(page, 'ASSIGN');
    const path = `/api/tenant/orders/${order.id}/responsibility-commands`;
    let body: Record<string, unknown> = {};
    await page.route(`**${path}`, async (route) => {
      body = route.request().postDataJSON();
      await route.abort('failed');
    });
    await form.submit.click();
    await expect(
      form.detail.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    ).toBeVisible();
    await page.unroute(`**${path}`);
    const result = await submit(
      page,
      `${path}/resolution`,
      form.detail.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    );
    expect(result.status).toBe('RETIRED');
    expect(await responsibilityPointers(page)).toEqual([]);
    expect((await api(page, `/orders/${order.id}/responsibility-commands`, body)).status()).toBe(
      409,
    );
    expect((await f.responsibility(order.id)).responsibility.version).toBe(0);
    expect((await f.history(order.id)).events).toEqual([]);
  } finally {
    await f.dispose();
  }
});
