import { randomUUID } from 'node:crypto';
import type { Browser, Page } from '@playwright/test';
import { cashMovementsFixture } from './cash-movements-setup';

export async function cashDiscrepanciesFixture(browser: Browser) {
  const f = await cashMovementsFixture(browser);
  try {
    const owner = await f.login('movement');
    const closed = [];
    for (const [index, counted] of ['9', '10', '12'].entries()) {
      const opened = await f.open(owner, '10', `Casă istorică ${index}`);
      const result = await f.close(opened.shift.id, owner, {
        countedCash: counted,
        ...(counted === '10'
          ? {}
          : { discrepancyReason: 'Diferență explicată la numărarea numerarului' }),
      });
      closed.push({ ...opened, ...result });
    }
    const archived = closed[0]!;
    await f.request(
      `/cash-registers/${archived.register.id}`,
      {
        locationId: f.location.id,
        requestKey: randomUUID(),
        version: 1,
        name: 'Denumirea istorică cea mai recentă',
      },
      f.admin,
      'PATCH',
    );
    const { shift } = await f.request(
      `/cash-registers/${archived.register.id}/open`,
      { locationId: f.location.id, requestKey: randomUUID(), openingAmount: '20' },
      owner,
    );
    const latest = await f.close(shift.id, owner, {
      countedCash: '21',
      discrepancyReason: 'Surplus justificat în a doua tură',
    });
    await f.request(`/cash-registers/${archived.register.id}/archive`, {
      locationId: f.location.id,
      requestKey: randomUUID(),
      version: 2,
    });
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Chisinau' }).format(
      new Date(latest.closing.closedAt),
    );
    return { ...f, ownerPage: owner, closed, archived, date };
  } catch (error) {
    await f.dispose();
    throw error;
  }
}

export function discrepancySection(page: Page) {
  return page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Diferențe la închiderea turelor', exact: true }),
  });
}

export async function smallReportPages(page: Page) {
  for (const endpoint of ['discrepancies', 'discrepancy-registers'])
    await page.route(`**/api/tenant/cash-shifts/${endpoint}?**`, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('limit', '1');
      await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
    });
}
