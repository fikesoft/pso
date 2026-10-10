import { test, expect } from '@playwright/test';
import { cashMovementsFixture, movementDetail, movementForm } from './cash-movements-setup';
import { cashPointers } from './cash-shifts-setup';
import { api, navigateSection, submit } from './support/browser-helpers';

for (const direction of ['IN', 'OUT'] as const)
  test(`numerar recovery ${direction}: retry exact și reload confirmă o singură mișcare fără sume în pointer`, async ({
    browser,
  }) => {
    const f = await cashMovementsFixture(browser);
    try {
      const page = await f.login('movement');
      const { shift, register } = await f.open(page, '100');
      await movementDetail(page, register.code);
      const form = await movementForm(page, direction);
      const path = `/api/tenant/cash-shifts/${shift.id}/movements`;
      const bodies: unknown[] = [];
      await page.route(`**${path}`, async (route) => {
        bodies.push(route.request().postDataJSON());
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('failed');
      });
      const failed = page.waitForEvent(
        'requestfailed',
        (request) => new URL(request.url()).pathname === path && request.method() === 'POST',
      );
      await form
        .getByRole('button', {
          name: direction === 'IN' ? 'Introdu numerar' : 'Retrage numerar',
          exact: true,
        })
        .click();
      await failed;
      await expect(form.getByLabel('Sumă (MDL)', { exact: true })).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(form).toBeVisible();
      const saved = await cashPointers(page, 'CASH');
      expect(saved).toHaveLength(1);
      expect(Object.keys(saved[0].value).sort()).toEqual([
        'actorUserId',
        'command',
        'locationId',
        'organizationId',
      ]);
      expect(Object.keys(saved[0].value.command).sort()).toEqual([
        'kind',
        'locationId',
        'requestKey',
        'shiftId',
      ]);
      expect(saved[0].value.command).toMatchObject({
        kind: direction === 'IN' ? 'CASH_IN' : 'CASH_OUT',
        shiftId: shift.id,
      });
      expect(JSON.stringify(saved)).not.toContain('Motiv privat');
      const retryFailed = page.waitForEvent(
        'requestfailed',
        (request) => new URL(request.url()).pathname === path,
      );
      await form.getByRole('button', { name: 'Reîncearcă exact operația', exact: true }).click();
      await retryFailed;
      expect(bodies).toHaveLength(2);
      expect(bodies[1]).toEqual(bodies[0]);
      await page.unroute(`**${path}`);
      await f.close(shift.id, page);
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
        '/api/tenant/cash-movement-commands/resolution',
        page.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
      );
      expect(result.status).toBe('SUCCEEDED');
      expect(await cashPointers(page, 'CASH')).toEqual([]);
      const current = await f.detail(shift.id, page);
      expect(current.summary.expectedCash).toBe(direction === 'IN' ? '107.00' : '93.00');
      expect(current.shift.version).toBe(3);
      expect(
        (
          await f.request(
            `/cash-shifts/${shift.id}/movements?locationId=${f.location.id}`,
            undefined,
            page,
          )
        ).movements,
      ).toHaveLength(2);
    } finally {
      await f.dispose();
    }
  });

test('numerar recovery: tentativei necomise i se retrage cheia, iar POST întârziat nu modifică soldul', async ({
  browser,
}) => {
  const f = await cashMovementsFixture(browser);
  try {
    const page = await f.login('movement');
    const { shift, register } = await f.open(page, '10');
    await movementDetail(page, register.code);
    const form = await movementForm(page, 'OUT');
    const path = `/api/tenant/cash-shifts/${shift.id}/movements`;
    let body: Record<string, unknown> = {};
    await page.route(`**${path}`, async (route) => {
      body = route.request().postDataJSON();
      await route.abort('failed');
    });
    await form.getByRole('button', { name: 'Retrage numerar', exact: true }).click();
    await expect(
      form.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    ).toBeVisible();
    await page.unroute(`**${path}`);
    const result = await submit(
      page,
      '/api/tenant/cash-movement-commands/resolution',
      form.getByRole('button', { name: 'Verifică rezultatul operației', exact: true }),
    );
    expect(result.status).toBe('RETIRED');
    expect(await cashPointers(page, 'CASH')).toEqual([]);
    expect((await api(page, `/cash-shifts/${shift.id}/movements`, body)).status()).toBe(409);
    expect((await f.detail(shift.id, page)).summary.expectedCash).toBe('10.00');
  } finally {
    await f.dispose();
  }
});
