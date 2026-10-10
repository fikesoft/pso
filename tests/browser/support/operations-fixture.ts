import { cashShiftFixture } from './cash-shift-fixture';
import { randomBytes } from 'node:crypto';
import type { Browser, BrowserContext } from '@playwright/test';
import { createDatabaseClient } from '../../../packages/db/src';
import { hashPassword } from '../../../apps/api/src/crypto';
import { isLocal } from './browser.constants';
import { isolatedPage, navigateSection } from './browser-helpers';
import { loginAndActivate, makeAccount } from './authentication';
import { createCompany, createLocation } from './provisioning';

export async function operationsFixture(browser: Browser) {
  const databaseUrl = process.env.PLATFORM_DATABASE_URL;
  if (process.env.NODE_ENV === 'production' || !databaseUrl || !isLocal(databaseUrl))
    throw new Error('Operațiunile E2E necesită baza locală de dezvoltare.');
  const db = createDatabaseClient(databaseUrl, 2);
  const suffix = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  const ownerAccount = makeAccount(`operations-${suffix}`);
  const primary = makeAccount('admin');
  const contexts: BrowserContext[] = [];
  const owner = await db.platformAdmin.create({
    data: {
      loginNormalized: ownerAccount.login,
      displayName: 'E2E Operațiuni Sintetice',
      passwordHash: await hashPassword(ownerAccount.initialPassword),
      mustChangePassword: true,
      mfaRequired: true,
    },
  });
  async function dispose() {
    await Promise.all(contexts.map((context) => context.close()));
    await db.platformSession.updateMany({
      where: { platformAdminId: owner.id },
      data: { revokedAt: new Date() },
    });
    await db.platformAdmin.update({
      where: { id: owner.id },
      data: { status: 'DISABLED', authVersion: { increment: 1 } },
    });
    await db.$disconnect();
  }
  try {
    const platform = await isolatedPage(browser, contexts);
    await loginAndActivate(platform, ownerAccount, { plane: 'platform', first: true });
    const slug = `operations-${suffix}`;
    await createCompany(platform, slug, 'E2E Restaurant Sintetic', primary);
    const admin = await isolatedPage(browser, contexts);
    await loginAndActivate(admin, primary, { slug, first: true });
    await navigateSection(admin, 'Locații');
    const location = await createLocation(admin, 'E2E Centru', 'CTR');
    const otherLocation = await createLocation(admin, 'E2E Nord', 'NORD');
    return {
      admin,
      primary,
      slug,
      location,
      otherLocation,
      dispose,
      cashShift: cashShiftFixture(admin, location.id),
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
