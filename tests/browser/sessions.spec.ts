import { test, expect } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { loginAndActivate } from './support/authentication';
import { localOnly, navigateSection, noOverflow } from './support/browser-helpers';

test('sesiuni: revocarea altei sesiuni și deconectarea tuturor', async ({ browser }) => {
  test.setTimeout(180_000);
  const fixture = await operationsFixture(browser);
  const otherContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
  try {
    await localOnly(otherContext);
    const other = await otherContext.newPage();
    await loginAndActivate(other, fixture.primary, { slug: fixture.slug });
    await navigateSection(fixture.admin, 'Privire de ansamblu');
    const sessions = fixture.admin.getByRole('region', { name: 'Sesiuni active' });
    await expect(sessions.getByRole('article')).toHaveCount(2);
    await expect(sessions.getByText('Sesiunea curentă', { exact: true })).toHaveCount(1);
    await fixture.admin.setViewportSize({ width: 360, height: 800 });
    await noOverflow(fixture.admin);
    const remote = sessions.getByRole('article').filter({ hasNotText: 'Sesiunea curentă' });
    await remote.getByRole('button', { name: 'Revocă sesiunea' }).click();
    const confirmation = fixture.admin.getByRole('dialog', { name: 'Confirmă revocarea' });
    await expect(confirmation).toContainText('Sesiunea selectată va pierde imediat accesul.');
    await confirmation.getByRole('button', { name: 'Revocă accesul' }).click();
    await expect(sessions.getByRole('article')).toHaveCount(1);
    await other.reload();
    await expect(other.getByRole('heading', { name: 'Bine ai revenit' })).toBeVisible();
    await fixture.admin.route('**/api/tenant/sessions*', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Acces refuzat sintetic' }),
      }),
    );
    await sessions.getByRole('button', { name: 'Reîncarcă sesiunile' }).click();
    await expect(sessions.getByText('Acces refuzat sintetic')).toBeVisible();
    await expect(sessions.getByRole('article')).toHaveCount(0);
    await expect(sessions.getByRole('button', { name: 'Revocă toate sesiunile' })).toHaveCount(0);
    await fixture.admin.unroute('**/api/tenant/sessions*');
    await sessions.getByRole('button', { name: 'Reîncarcă sesiunile' }).click();
    await expect(sessions.getByRole('article')).toHaveCount(1);
    await fixture.admin.route('**/api/tenant/auth/logout', (route) => route.abort('failed'));
    await sessions.getByRole('button', { name: 'Revocă toate sesiunile' }).click();
    await expect(confirmation).toContainText('Și sesiunea ta curentă se va încheia.');
    await confirmation.getByRole('button', { name: 'Revocă accesul' }).click();
    await expect(fixture.admin.getByRole('heading', { name: 'Bine ai revenit' })).toBeVisible();
    await fixture.admin.unroute('**/api/tenant/auth/logout');
  } finally {
    await otherContext.close();
    await fixture.dispose();
  }
});
