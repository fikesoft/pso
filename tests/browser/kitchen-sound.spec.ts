import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { orderRealtimeFixture } from './order-realtime-setup';
import { api, navigateSection, noOverflow } from './support/browser-helpers';

test('sunet KDS: activare explicită, sosiri deduplicate, filtrare, reconectare și revocare', async ({
  browser,
}, info) => {
  const f = await orderRealtimeFixture(browser, 'kitchen');
  const { admin, operator, location, product } = f;
  try {
    await operator.addInitScript(() => {
      const counters = { played: 0, closed: 0 };
      Object.defineProperty(window, '__kitchenAudio', { value: counters });
      const create = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const oscillator = create.call(this);
        const start = oscillator.start.bind(oscillator);
        oscillator.start = (when) => {
          counters.played++;
          start(when);
        };
        return oscillator;
      };
      const close = AudioContext.prototype.close;
      AudioContext.prototype.close = function () {
        counters.closed++;
        return close.call(this);
      };
    });
    await operator.reload();
    await operator
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(location.id);
    await navigateSection(operator, 'Bucătărie');
    const sound = operator.getByRole('region', { name: 'Sunet bucătărie', exact: true });
    const played = () => operator.evaluate<number>('window.__kitchenAudio.played');
    const arrivals = () =>
      operator.waitForResponse(
        (response) => response.url().includes('/kitchen/arrivals?') && response.status() === 200,
      );
    const create = async () => {
      const draft = await api(admin, '/orders', {
        locationId: location.id,
        serviceType: 'PICKUP',
        requestKey: randomUUID(),
        items: [{ productId: product.id, quantity: '1' }],
      });
      expect(draft.status()).toBe(200);
      const { order } = await draft.json();
      const sent = await api(admin, `/orders/${order.id}/send`, {
        version: order.version,
        requestKey: randomUUID(),
      });
      expect(sent.status()).toBe(200);
      return (await sent.json()).ticket;
    };
    await create();
    await expect(sound.getByText('Sunet oprit', { exact: true })).toBeVisible();
    expect(await played()).toBe(0);
    let read = arrivals();
    await sound.getByRole('button', { name: 'Activează sunetul', exact: true }).click();
    await read;
    expect(await played()).toBe(0);
    const ticket = await create();
    await expect.poll(played).toBe(1);
    read = arrivals();
    expect(
      (
        await api(
          admin,
          `/kitchen/tickets/${ticket.id}`,
          { version: 1, status: 'PREPARING' },
          'PATCH',
        )
      ).status(),
    ).toBe(200);
    await read;
    expect(await played()).toBe(1);
    await operator.evaluate(() => window.dispatchEvent(new Event('test:pause-kitchen')));
    await expect(
      operator.getByText('Bucătărie actualizată în timp real', { exact: true }),
    ).toHaveCount(0);
    await create();
    await create();
    expect(await played()).toBe(1);
    await operator.evaluate(() => window.dispatchEvent(new Event('test:resume-kitchen')));
    await expect.poll(played).toBe(2);
    await operator
      .getByRole('combobox', { name: 'Stația afișată', exact: true })
      .selectOption('UNASSIGNED');
    await expect(sound.getByText('Sunet oprit', { exact: true })).toBeVisible();
    expect(await operator.evaluate<number>('window.__kitchenAudio.closed')).toBe(1);
    read = arrivals();
    await sound.getByRole('button', { name: 'Activează sunetul', exact: true }).click();
    await read;
    read = arrivals();
    const createdStation = await api(admin, '/kitchen-stations', {
      locationId: location.id,
      requestKey: randomUUID(),
      code: 'SOUND',
      name: 'Stație sunet',
      sortOrder: 0,
    });
    expect(createdStation.status()).toBe(200);
    await read;
    const { station } = await createdStation.json();
    expect(
      (
        await api(
          admin,
          '/kitchen-routing',
          {
            locationId: location.id,
            productId: product.id,
            stationId: station.id,
            version: 0,
            requestKey: randomUUID(),
          },
          'PUT',
        )
      ).status(),
    ).toBe(200);
    read = arrivals();
    await create();
    await read;
    expect(await played()).toBe(2);
    await sound.getByRole('button', { name: 'Testează sunetul', exact: true }).click();
    await expect.poll(played).toBe(3);
    await operator.setViewportSize({ width: 360, height: 800 });
    await noOverflow(operator);
    await operator.screenshot({ path: info.outputPath('kitchen-sound-360.png'), fullPage: true });
    expect((await api(operator, '/auth/logout', {})).status()).toBe(200);
    await expect.poll(() => operator.evaluate<number>('window.__kitchenAudio.closed')).toBe(2);
  } finally {
    await f.dispose();
  }
});

test('sunet KDS: activarea blocată expiră și poate fi reluată explicit', async ({ browser }) => {
  const f = await orderRealtimeFixture(browser, 'kitchen');
  try {
    const page = f.operator;
    await page.addInitScript(() => {
      const resume = AudioContext.prototype.resume;
      AudioContext.prototype.resume = () => new Promise<void>(() => {});
      window.addEventListener('test:allow-kitchen-audio', () => {
        AudioContext.prototype.resume = resume;
      });
    });
    await page.reload();
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(f.location.id);
    await navigateSection(page, 'Bucătărie');
    const sound = page.getByRole('region', { name: 'Sunet bucătărie', exact: true });
    await sound.getByRole('button', { name: 'Activează sunetul', exact: true }).click();
    await expect(sound.getByText(/Sunetul nu este disponibil/)).toBeVisible();
    await expect(
      sound.getByRole('button', { name: 'Activează sunetul', exact: true }),
    ).toBeEnabled();
    await page.evaluate(() => window.dispatchEvent(new Event('test:allow-kitchen-audio')));
    await sound.getByRole('button', { name: 'Activează sunetul', exact: true }).click();
    await expect(sound.getByText('Sunet activ pentru tichete noi', { exact: true })).toBeVisible();
    await expect(sound.getByText(/Sunetul nu este disponibil/)).toHaveCount(0);
    await sound.getByRole('button', { name: 'Oprește sunetul', exact: true }).click();
    await expect(sound.getByText('Sunet oprit', { exact: true })).toBeVisible();
  } finally {
    await f.dispose();
  }
});
