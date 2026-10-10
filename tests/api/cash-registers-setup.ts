import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { prepareRegisterTenants } from './cash-registers-tenants';
import { activate, BrowserSession } from './support/harness';
import type { RegisterActor } from './cash-registers.types';

export async function prepareCashRegisters() {
  const f = await prepareRegisterTenants();
  const pending = [];
  for (const [name, permissions] of Object.entries({
    manager: ['cash.registers.read', 'cash.registers.manage'],
    second: ['cash.registers.read', 'cash.registers.manage'],
    reader: ['cash.registers.read'],
    manageOnly: ['cash.registers.manage'],
    denied: ['cash.registers.read', 'cash.registers.manage'],
    preMfa: ['cash.registers.read', 'cash.registers.manage'],
  })) {
    const role = (
      await f.a.primary.expect('/roles', 'POST', {
        name: `Register ${name}`,
        permissions: permissions.map((permission) => ({ permission })),
      })
    ).role;
    const login = `register-${name.toLowerCase()}`;
    const created = await f.a.primary.expect('/staff', 'POST', {
      login,
      displayName: login,
      locationIds: [f.a.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
      ],
    });
    if (name === 'denied')
      await f.a.primary.expect(`/staff/${created.user.id}/overrides`, 'POST', {
        permission: 'cash.registers.manage',
        effect: 'DENY',
        scopeType: 'LOCATION',
        locationId: f.a.location.id,
      });
    pending.push({ name, login, permissions, created });
  }
  const actors: Record<string, RegisterActor> = {};
  for (const account of pending) {
    const session = new BrowserSession('TENANT');
    const activated = await activate(
      session,
      account.login,
      account.created.temporaryPassword,
      f.a.company.organization.slug,
    );
    let secret: string | undefined;
    if (account.permissions.includes('cash.registers.manage')) {
      expect(activated.state.stage).toBe('enroll');
      if (account.name !== 'preMfa') secret = await session.enroll();
    }
    actors[account.name] = {
      session,
      secret,
      id: account.created.user.id,
      login: account.login,
      password: activated.permanent,
    };
  }
  const body = (code = `R-${randomUUID().slice(0, 8)}`) => ({
    locationId: f.a.location.id,
    code,
    name: 'Casă sintetică',
    requestKey: randomUUID(),
  });
  return { ...f, actors, body };
}
