import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { hashPassword, temporaryPassword } from '../../entities/session';
import type { TenantLoginLookup } from '../../entities/session';
import { config } from '../../shared/config';
import { bootstrapDb, platformDb } from '../../shared/db';
import { DEMO_EMPTY_COMPANY, DEMO_ACCOUNTS_PATH } from '../config/demo.constants';
import type { DemoAccounts } from './demo.types';

export function readDemoAccounts(): DemoAccounts | undefined {
  return existsSync(DEMO_ACCOUNTS_PATH)
    ? (JSON.parse(readFileSync(DEMO_ACCOUNTS_PATH, 'utf8')) as DemoAccounts)
    : undefined;
}

export async function findDemoCompany(slug: string, login: string) {
  const rows = await bootstrapDb.$queryRaw<TenantLoginLookup[]>`
    SELECT pos_auth.lookup_tenant_login(${slug},${login}) AS data`;
  const identity = rows[0]?.data;
  if (!identity?.user.organizationId || !identity.user.isPrimaryAdmin)
    throw new Error(`Administratorul principal pentru ${slug} nu este disponibil.`);
  return identity;
}

export async function ensureEmptyDemoCompany(accounts: DemoAccounts, ownerId: string) {
  if (accounts.companies.some((company) => company.slug === DEMO_EMPTY_COMPANY.slug)) {
    await findDemoCompany(DEMO_EMPTY_COMPANY.slug, 'admin');
    return;
  }
  const pending = `${DEMO_ACCOUNTS_PATH}.pending`;
  if (existsSync(pending))
    throw new Error(`Există ${pending}; verificați recuperarea locală înainte de reluare.`);
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  const expiry = new Date(Date.now() + config.TEMP_PASSWORD_HOURS * 3600000);
  const { slug, name } = DEMO_EMPTY_COMPANY;
  const next = {
    ...accounts,
    companies: [
      ...accounts.companies,
      { slug, name, admin: { login: 'admin', password }, users: [] },
    ],
  };
  // Persist the issued password before commit; a crash leaves a private recovery file.
  writeFileSync(pending, JSON.stringify(next, null, 2), { mode: 0o600, flag: 'wx' });
  chmodSync(pending, 0o600);
  await platformDb.$queryRaw`
    SELECT pos_control.provision_organization(${slug},${name},${'Companie de exercițiu'},${'admin'},${'Administrator exercițiu'},${hash},${expiry},${ownerId}::uuid) AS data`;
  renameSync(pending, DEMO_ACCOUNTS_PATH);
  accounts.companies = next.companies;
}
