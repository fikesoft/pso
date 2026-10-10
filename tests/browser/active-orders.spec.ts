import { test, expect } from '@playwright/test';
import { activeOrdersFixture } from './active-orders-setup';

test('comenzi active: plata și livrarea remote elimină cardul fără să închidă detaliul selectat', async ({
  browser,
}) => {
  const f = await activeOrdersFixture(browser);
  try {
    const order = await f.complete({ serviceType: 'DELIVERY' });
    const card = f.operator
      .getByRole('region', { name: 'Comenzi active', exact: true, includeHidden: true })
      .getByTestId('active-order-card')
      .filter({
        has: f.operator.getByRole('heading', {
          name: `Comanda #${order.number}`,
          exact: true,
          includeHidden: true,
        }),
      });
    await expect(card).toContainText('Plată rămasă');
    await expect(card).toContainText('Livrare neîncheiată');
    await card.getByRole('button', { name: 'Deschide comanda', exact: true }).click();
    const detail = f.operator.getByRole('dialog', {
      name: `Comanda #${order.number}`,
      exact: true,
    });
    await detail.getByTestId('order-timeline').locator('summary').click();
    await f.command(order.id, 'payments', {
      cashShiftId: (await f.cashShift()).id,
      confirmed: true,
      payments: [{ method: 'CARD', amount: order.total }],
    });
    await expect(card).not.toContainText('Plată rămasă');
    await expect(card).toContainText('Livrare neîncheiată');
    await f.command(order.id, 'delivery', {
      status: 'ASSIGNED',
      courierUserId: f.actors.courier.user.id,
    });
    for (const status of ['PICKED_UP', 'DELIVERING', 'DELIVERED'])
      await f.command(order.id, 'delivery', { status });
    await expect(card).toHaveCount(0);
    await expect(detail).toBeVisible();
    await expect(detail.getByTestId('order-timeline')).toHaveAttribute('open', '');
    await expect(
      detail.getByTestId('order-timeline-event').filter({ hasText: 'Livrare actualizată' }),
    ).toHaveCount(4);
    expect(await f.current(order.id)).toMatchObject({
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      deliveryStatus: 'DELIVERED',
    });
  } finally {
    await f.dispose();
  }
});
