import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createHmac, randomBytes } from 'node:crypto';
import {
  tenantOrigin,
  platformOrigin,
  SYNTHETIC_LOGIN_INTERVAL_MS,
  SYNTHETIC_LOGIN_WINDOW_MS,
} from './browser.constants';
import { submit, session } from './browser-helpers';
import type { SyntheticAccount } from './account.types';
let nextLoginAt = 0;
function totp(secret: string, timestamp = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let accumulator = 0;
  let bits = 0;
  const decoded: number[] = [];
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('Secret TOTP sintetic nevalid.');
    accumulator = (accumulator << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      decoded.push((accumulator >> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30_000)));
  const digest = createHmac('sha1', Buffer.from(decoded)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
export async function loginAndActivate(
  page: Page,
  account: SyntheticAccount,
  options: { plane?: 'tenant' | 'platform'; slug?: string; first?: boolean } = {},
) {
  const plane = options.plane ?? 'tenant';
  await page.goto(
    plane === 'platform' ? platformOrigin : `${tenantOrigin}/c/${options.slug}/login`,
  );
  await expect(page.getByRole('heading', { name: 'Bine ai revenit' })).toBeVisible();
  if (plane === 'tenant')
    await page.getByRole('button', { name: 'Administratori · parolă', exact: true }).click();
  await page.getByLabel('Login', { exact: true }).fill(account.login);
  await page
    .getByLabel('Parolă', { exact: true })
    .fill(options.first ? account.initialPassword : account.password);
  const loginDelay = Math.max(0, nextLoginAt - Date.now());
  if (loginDelay) await page.waitForTimeout(loginDelay);
  nextLoginAt = Date.now() + SYNTHETIC_LOGIN_INTERVAL_MS;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/${plane}/auth/login` &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Autentificare', exact: true }).click();
    const response = await pending;
    if (response.status() === 429 && attempt === 0) {
      // Worker restarts and direct API probes share the persistent loopback IP bucket.
      // Wait out its real window; do not reset the limiter or relax application limits.
      await page.waitForTimeout(SYNTHETIC_LOGIN_WINDOW_MS);
      nextLoginAt = Date.now() + SYNTHETIC_LOGIN_INTERVAL_MS;
      continue;
    }
    expect(response.status(), 'Autentificarea sintetică trebuie să reușească').toBe(200);
    break;
  }
  if (options.first) {
    await expect(page.getByRole('heading', { name: 'Alege o parolă personală' })).toBeVisible();
    if (plane === 'tenant')
      expect((await page.request.get(`${tenantOrigin}/api/tenant/context`)).status()).toBe(403);
    await page.getByLabel('Parola temporară / actuală').fill(account.initialPassword);
    await page.getByLabel('Parola nouă').fill(account.password);
    await submit(
      page,
      `/api/${plane}/auth/password`,
      page.getByRole('button', { name: 'Schimbă parola și continuă' }),
    );
  }
  const state = await session(page, plane);
  if (state.stage === 'enroll') {
    await expect(page.getByRole('heading', { name: 'Protejează-ți contul' })).toBeVisible();
    if (plane === 'tenant')
      expect((await page.request.get(`${tenantOrigin}/api/tenant/context`)).status()).toBe(403);
    await page.getByRole('button', { name: 'Configurează autentificarea în doi pași' }).click();
    account.secret = (await page.getByLabel('Cheie TOTP').textContent())!.trim();
  }
  if (state.stage === 'enroll' || state.stage === 'mfa') {
    expect(account.secret, 'Identitatea de test trebuie să aibă cheia TOTP locală').toBeTruthy();
    // Respect anti-replay; never reuse a code from the previous login.
    if (account.lastStep === Math.floor(Date.now() / 30_000)) {
      await page.waitForTimeout(30_050 - (Date.now() % 30_000));
    }
    account.lastStep = Math.floor(Date.now() / 30_000);
    await page.getByLabel('Cod de autentificare', { exact: true }).fill(totp(account.secret!));
    await submit(
      page,
      `/api/${plane}/auth/mfa/verify`,
      page.getByRole('button', { name: 'Verifică și continuă' }),
    );
  }
  await expect(
    page.getByRole('heading', { name: plane === 'platform' ? 'Companii' : /^Bun venit,/ }),
  ).toBeVisible();
}
export const makeAccount = (login: string): SyntheticAccount => ({
  login,
  initialPassword: randomBytes(20).toString('base64url'),
  password: randomBytes(24).toString('base64url'),
});
