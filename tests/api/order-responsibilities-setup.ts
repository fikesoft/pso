import { randomUUID } from 'node:crypto';
import { prepareCashShifts } from './cash-shifts-setup';
import { activate, BrowserSession, fixturePasswords, totp } from './support/harness';
import type { ResponsibilityActor } from './order-responsibilities.types';

export async function prepareOrderResponsibilities() {
  const f = await prepareCashShifts();
  const actors: Record<string, ResponsibilityActor> = {};
  const read = ['cash.registers.read', 'cash.shifts.read'];
  const own = [...read, 'cash.shifts.open', 'cash.shifts.close', 'orders.read', 'orders.handoff'];
  const definitions = {
    outgoing: own,
    incoming: own,
    limited: own,
    noHandoff: [...read, 'cash.shifts.open', 'cash.shifts.close', 'orders.read'],
    reporter: [...read, 'cash.reports.read'],
    manager: [...read, 'cash.reports.read', 'orders.read', 'orders.handoff-others'],
    noReports: [...read, 'orders.read', 'orders.handoff-others'],
    closeManager: [
      ...read,
      'orders.read',
      'cash.reports.read',
      'cash.shifts.close',
      'cash.shifts.close-others',
    ],
  };
  const pending = [];
  for (const [name, permissions] of Object.entries(definitions)) {
    const { role } = await f.a.primary.expect('/roles', 'POST', {
      name: `Responsabilitate ${name}`,
      permissions: permissions.map((permission) => ({
        permission,
        ...(name === 'limited' && permission === 'orders.read'
          ? { limits: { maxAmount: '10' } }
          : {}),
      })),
    });
    const password = ['manager', 'noReports', 'closeManager'].includes(name);
    const account = await f.a.primary.expect('/staff', 'POST', {
      login: `responsibility-${name.toLowerCase()}`,
      displayName: `Operator ${name}`,
      ...(password ? {} : { authenticationMethod: 'PIN' }),
      locationIds: [f.locationId],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.locationId },
      ],
    });
    pending.push({ name, password, account });
  }
  for (const { name, password, account } of pending) {
    const session = new BrowserSession('TENANT');
    const login = `responsibility-${name.toLowerCase()}`;
    if (password) {
      const activation = await activate(
        session,
        login,
        account.temporaryPassword,
        f.a.company.organization.slug,
      );
      actors[name] = { session, userId: account.user.id, login, password: activation.permanent };
    } else {
      fixturePasswords.add(account.pin);
      await session.expect('/auth/session');
      await session.expect('/auth/pin', 'POST', {
        companySlug: f.a.company.organization.slug,
        pin: account.pin,
      });
      actors[name] = { session, userId: account.user.id, login, pin: account.pin };
    }
  }
  const login = async (name: string, mfa = true) => {
    const actor = actors[name]!;
    const session = new BrowserSession('TENANT');
    if (actor.pin) {
      await session.expect('/auth/session');
      await session.expect('/auth/pin', 'POST', {
        companySlug: f.a.company.organization.slug,
        pin: actor.pin,
      });
    } else {
      await session.login(actor.login, actor.password!, f.a.company.organization.slug);
      if (mfa && actor.secret)
        await session.expect('/auth/mfa/verify', 'POST', { code: totp(actor.secret) });
    }
    actor.session = session;
    return session;
  };
  const current = (id: string, actor = f.a.primary) =>
    actor.expect(`/orders/${id}/responsibility?locationId=${f.locationId}`);
  const history = (id: string, actor = f.a.primary, extra = '') =>
    actor.expect(`/orders/${id}/responsibility-events?locationId=${f.locationId}${extra}`);
  const queue = (changes: Record<string, string>, actor = actors.outgoing!.session) =>
    actor.expect(
      `/order-responsibilities?${new URLSearchParams({ locationId: f.locationId, view: 'UNASSIGNED', ...changes })}`,
    );
  const command = async (
    id: string,
    changes: Record<string, unknown>,
    actor = actors.outgoing!.session,
  ) => {
    const state = await current(id, actor);
    const body = {
      locationId: f.locationId,
      requestKey: randomUUID(),
      orderVersion: state.order.version,
      responsibilityVersion: state.responsibility.version,
      reason: 'Responsabilitate confirmată explicit',
      ...changes,
    };
    return { body, ...(await actor.expect(`/orders/${id}/responsibility-commands`, 'POST', body)) };
  };
  const assign = (id: string, targetShiftId: string, actor = actors.outgoing!.session) =>
    command(id, { kind: 'ASSIGN', targetShiftId }, actor);
  const prepare = (
    id: string,
    sourceShiftId: string,
    actor = actors.outgoing!.session,
    changes: Record<string, unknown> = {},
  ) => command(id, { kind: 'PREPARE_HANDOFF', sourceShiftId, ...changes }, actor);
  const openRegister = async (registerId: string, actor = actors.incoming!.session) =>
    (
      await actor.expect(`/cash-registers/${registerId}/open`, 'POST', {
        locationId: f.locationId,
        requestKey: randomUUID(),
        openingAmount: '0',
      })
    ).shift;
  return {
    ...f,
    responsibilityActors: actors,
    responsibilityLogin: login,
    current,
    history,
    queue,
    command,
    assign,
    prepare,
    openRegister,
  };
}
