import { test, expect } from '@playwright/test';
import {
  cashRegisterFixture,
  newRegisterForm,
  registerCard,
  registerPointers,
} from './cash-register-setup';
import { navigateSection, submit } from './support/browser-helpers';

test('case: paginarea refuzată șterge datele, iar eșecul recitirii nu transformă salvarea confirmată în rezultat necunoscut', async ({
  browser,
}) => {
  const f = await cashRegisterFixture(browser);
  const page = f.admin;
  try {
    for (let index = 0; index < 51; index++)
      await f.create(`PAGE_${String(index).padStart(2, '0')}`);
    await navigateSection(page, 'Case');
    await expect(page.getByRole('article')).toHaveCount(50);
    await page.route('**/api/tenant/cash-registers?**', async (route) => {
      if (new URL(route.request().url()).searchParams.has('cursor')) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Acces retras în timpul paginării',
            code: 'REQUEST_REJECTED',
          }),
        });
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Mai multe case', exact: true }).click();
    await expect(page.getByText('Acces retras în timpul paginării', { exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await page.unroute('**/api/tenant/cash-registers?**');
    await page.getByRole('button', { name: 'Reîncarcă lista', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(50);
    const form = await newRegisterForm(page, 'AFTER_COMMIT', 'Salvare confirmată');
    await page.route('**/api/tenant/cash-registers?**', async (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Lista nu poate fi recitită momentan',
          code: 'INTERNAL_ERROR',
        }),
      }),
    );
    const result = await submit(
      page,
      '/api/tenant/cash-registers',
      form.getByRole('button', { name: 'Salvează', exact: true }),
    );
    expect(result.register.name).toBe('Salvare confirmată');
    await expect(form).not.toBeVisible();
    await expect(page.getByText('Operația a fost confirmată.', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Lista nu poate fi recitită momentan', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Verifică rezultatul tentativei', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Reîncearcă exact tentativa', exact: true }),
    ).toHaveCount(0);
    expect(await registerPointers(page)).toEqual([]);
    await page.unroute('**/api/tenant/cash-registers?**');
    await page.getByRole('button', { name: 'Reîncarcă lista', exact: true }).click();
    await expect(registerCard(page, 'Salvare confirmată')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adaugă casă', exact: true })).toBeEnabled();
  } finally {
    await f.dispose();
  }
});
