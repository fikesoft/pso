import { expect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { operationsFixture } from './support/operations-fixture';
import { createOperationalProduct } from './support/operations-catalog';
import { api, localOnly, navigateSection, submit } from './support/browser-helpers';
import { tenantOrigin } from './support/browser.constants';

export async function orderRealtimeFixture(
  browser: Browser,
  topic: 'orders' | 'kitchen' = 'orders',
) {
  const f = await operationsFixture(browser);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await localOnly(context);
  const operator = await context.newPage();
  try {
    await f.admin
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.location.id);
    const product = await createOperationalProduct(f.admin);
    const role = await api(f.admin, '/roles', {
      name: 'Operator realtime',
      permissions: [
        'orders.read',
        'orders.create',
        'kitchen.read',
        'payments.collect',
        'cash.registers.read',
        'cash.shifts.read',
        'cash.shifts.open',
      ].map((permission) => ({ permission })),
    });
    expect(role.status()).toBe(200);
    const created = await api(f.admin, '/staff', {
      login: 'realtime-pin',
      displayName: 'Operator realtime',
      authenticationMethod: 'PIN',
      locationIds: [f.location.id],
      assignments: [
        {
          roleVersionId: (await role.json()).role.versions[0].id,
          scopeType: 'LOCATION',
          locationId: f.location.id,
        },
      ],
    });
    expect(created.status()).toBe(200);
    const actor = await created.json();
    await operator.addInitScript((topic) => {
      const Original = window.WebSocket;
      let paused = false;
      window.addEventListener(`test:pause-${topic}`, () => {
        paused = true;
        window.dispatchEvent(new Event(`test:disconnect-${topic}`));
      });
      window.addEventListener(`test:resume-${topic}`, () => {
        paused = false;
        window.dispatchEvent(new Event('online'));
      });
      window.WebSocket = class extends Original {
        override send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
          if (paused && typeof data === 'string') {
            try {
              if (JSON.parse(data)?.topic === topic) {
                this.close(4000);
                return;
              }
            } catch {
              /* Preserve ordinary WebSocket behavior for non-JSON data. */
            }
          }
          super.send(data);
        }
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          let orders = false;
          this.addEventListener('message', (event) => {
            try {
              orders ||= JSON.parse(String(event.data))?.topic === topic;
            } catch {
              /* Ignore frames unrelated to the test control. */
            }
          });
          const disconnect = () => {
            if (orders) this.close();
          };
          window.addEventListener(`test:disconnect-${topic}`, disconnect);
          this.addEventListener('close', () =>
            window.removeEventListener(`test:disconnect-${topic}`, disconnect),
          );
        }
      };
    }, topic);
    await operator.goto(`${tenantOrigin}/c/${f.slug}/login`);
    await operator.getByLabel('Cod PIN', { exact: true }).fill(actor.pin);
    await submit(
      operator,
      '/api/tenant/auth/pin',
      operator.getByRole('button', { name: 'Intră cu cod PIN', exact: true }),
    );
    await expect(operator.getByRole('heading', { name: /^Bun venit,/ })).toBeVisible();
    await operator
      .getByRole('combobox', { name: 'Context', exact: true })
      .selectOption(f.location.id);
    await navigateSection(operator, topic === 'kitchen' ? 'Bucătărie' : 'Comenzi');
    await expect(
      operator.getByText(
        topic === 'kitchen'
          ? 'Bucătărie actualizată în timp real'
          : 'Comenzi actualizate în timp real',
        { exact: true },
      ),
    ).toBeVisible();
    return {
      ...f,
      operator,
      product,
      dispose: async () => {
        await context.close();
        await f.dispose();
      },
    };
  } catch (error) {
    await context.close();
    await f.dispose();
    throw error;
  }
}
