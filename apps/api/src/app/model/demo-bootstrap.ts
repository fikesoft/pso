import { PERMISSIONS } from '@pos/authz';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { DEMO_OWNER_LOGIN } from '../config/demo.constants';
import type { DemoAccounts, DemoCompany } from './demo.types';
import { config } from '../../shared/config';
import { hashPassword, temporaryPassword } from '../../entities/session';
import { generateStaffPin, staffPinLookup } from '../../entities/session';
import { platformDb, runtime, withTenantTransaction } from '../../shared/db';
import type { ProvisioningResult } from '../../shared/db';
export async function createDemoAccounts() {
  if (config.NODE_ENV === 'production') throw new Error('Seedul este interzis în producție');
  if (existsSync('.local/dev-accounts.json'))
    throw new Error('Seedul a fost deja creat. Nu resetez conturile existente.');
  const login = DEMO_OWNER_LOGIN;
  const ownerPassword = temporaryPassword();
  if (await platformDb.platformAdmin.findUnique({ where: { loginNormalized: login } }))
    throw new Error('Există deja administratorul demo; nu îi schimb parola.');
  const owner = await platformDb.platformAdmin.create({
    data: {
      loginNormalized: login,
      displayName: 'Proprietar DEMO',
      passwordHash: await hashPassword(ownerPassword),
      mustChangePassword: true,
      mfaRequired: true,
    },
  });
  const accounts: DemoAccounts = {
    warning:
      'DATE SINTETICE LOCALE. Parole temporare, schimbați la prima autentificare. Nu publicați acest fișier.',
    platform: { login, password: ownerPassword },
    companies: [],
  };
  for (const [slug, name] of [
    ['sakura-demo', 'Sakura · DEMO'],
    ['bistro-demo', 'Bistro · DEMO'],
  ]) {
    const password = temporaryPassword();
    const hash = await hashPassword(password);
    const expiry = new Date(Date.now() + config.TEMP_PASSWORD_HOURS * 3600000);
    const rows = await platformDb.$queryRaw<
      ProvisioningResult[]
    >`SELECT pos_control.provision_organization(${slug},${name},${'Companie sintetică'},${'admin'},${'Administrator DEMO'},${hash},${expiry},${owner.id}::uuid) AS data`;
    const { organization, user } = rows[0].data;
    const company: DemoCompany = { slug, name, admin: { login: 'admin', password }, users: [] };
    await withTenantTransaction(
      runtime,
      { organizationId: organization.id, userId: user.id },
      async (tx) => {
        const locations = [];
        for (const code of ['A', 'B'])
          locations.push(
            await tx.location.create({
              data: { organizationId: organization.id, code, name: `Locația ${code}` },
            }),
          );
        const permissionSets = [
          {
            login: 'ana',
            name: 'Ana · administrator delegat',
            keys: [
              'locations.read',
              'staff.read',
              'staff.create',
              'staff.manage',
              'staff.credentials.reset',
              'roles.read',
              'orders.read',
              'orders.create',
              'kitchen.read',
            ],
            mfa: true,
          },
          {
            login: 'chelner',
            name: 'Chelner DEMO',
            keys: ['locations.read', 'orders.read', 'orders.create', 'kitchen.read'],
            mfa: false,
          },
        ];
        let managerId = user.id;
        for (const entry of permissionSets) {
          const temporary = temporaryPassword();
          const pin = entry.mfa ? undefined : generateStaffPin();
          const worker = await tx.companyUser.create({
            data: {
              organizationId: organization.id,
              loginNormalized: entry.login,
              displayName: entry.name,
              passwordHash: await hashPassword(temporary),
              temporaryPasswordExpiresAt: pin ? null : expiry,
              authenticationMethod: pin ? 'PIN' : 'PASSWORD',
              pinLookup: pin ? staffPinLookup(slug, pin) : null,
              pinHash: pin ? await hashPassword(pin) : null,
              mustChangePassword: !pin,
              activatedAt: pin ? new Date() : null,
              createdByUserId: user.id,
              managedByUserId: managerId,
              mfaRequired: entry.mfa,
            },
          });
          await tx.userLocationAccess.create({
            data: {
              organizationId: organization.id,
              userId: worker.id,
              locationId: locations[0]!.id,
              isDefault: true,
            },
          });
          const role = await tx.role.create({
            data: {
              organizationId: organization.id,
              name: entry.mfa ? 'Administrator local' : 'Chelner',
              createdByUserId: user.id,
            },
          });
          const version = await tx.roleVersion.create({
            data: {
              organizationId: organization.id,
              roleId: role.id,
              version: 1,
              createdByUserId: user.id,
            },
          });
          await tx.rolePermission.createMany({
            data: entry.keys
              .filter((key) => PERMISSIONS.some((p) => p.key === key))
              .map((permissionKey) => ({
                organizationId: organization.id,
                roleVersionId: version.id,
                permissionKey,
              })),
          });
          await tx.userRoleAssignment.create({
            data: {
              organizationId: organization.id,
              userId: worker.id,
              roleVersionId: version.id,
              scopeType: 'LOCATION',
              locationId: locations[0]!.id,
              issuedByUserId: user.id,
            },
          });
          if (entry.mfa) {
            managerId = worker.id;
            const grant = await tx.delegationGrant.create({
              data: {
                organizationId: organization.id,
                userId: worker.id,
                issuedByUserId: user.id,
                scopeType: 'LOCATION',
                locationId: locations[0]!.id,
              },
            });
            await tx.delegationGrantPermission.createMany({
              data: ['orders.read', 'orders.create', 'kitchen.read'].map((permissionKey) => ({
                organizationId: organization.id,
                delegationGrantId: grant.id,
                permissionKey,
              })),
            });
          }
          company.users.push(
            pin
              ? { login: entry.login, authenticationMethod: 'PIN', pin, location: 'A' }
              : {
                  login: entry.login,
                  authenticationMethod: 'PASSWORD',
                  password: temporary,
                  location: 'A',
                },
          );
        }
      },
    );
    accounts.companies.push(company);
  }
  mkdirSync('.local', { recursive: true, mode: 0o700 });
  writeFileSync('.local/dev-accounts.json', JSON.stringify(accounts, null, 2), { mode: 0o600 });
  console.log(
    'Două companii sintetice, câte două locații și trei conturi/companie create. Parolele temporare și codurile PIN: .local/dev-accounts.json (fișier privat local).',
  );
  return accounts;
}
