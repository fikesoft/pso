import { randomUUID } from 'node:crypto';
import { activate, BrowserSession, db, fixturePasswords, passwordHash } from './support/harness';

export async function prepareRegisterTenants() {
  const suffix = randomUUID().slice(0, 8);
  const password = `Registers-${randomUUID()}`;
  fixturePasswords.add(password);
  const owner = await db.platformDb.platformAdmin.create({
    data: {
      loginNormalized: `registers-${suffix}`,
      displayName: 'Case sintetice',
      passwordHash: await passwordHash(password),
    },
  });
  const platform = new BrowserSession('PLATFORM');
  await platform.login(owner.loginNormalized, password);
  await platform.enroll();
  const tenant = async (label: string) => {
    const company = await platform.expect(
      '/organizations',
      'POST',
      {
        slug: `registers-${suffix}-${label}`,
        name: `Case ${label}`,
        adminLogin: 'admin',
        adminDisplayName: 'Administrator case',
      },
      201,
    );
    const primary = new BrowserSession('TENANT');
    const activation = await activate(
      primary,
      'admin',
      company.temporaryPassword,
      company.organization.slug,
    );
    const secret = await primary.enroll();
    const location = (await primary.expect('/locations', 'POST', { name: 'Centru', code: 'CTR' }))
      .location;
    return { primary, company, location, password: activation.permanent, secret };
  };
  const a = await tenant('a');
  const b = await tenant('b');
  const otherLocation = (
    await a.primary.expect('/locations', 'POST', { name: 'Nord', code: 'NORD' })
  ).location;
  return { a, b, otherLocation, owner };
}
