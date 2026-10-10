import { randomUUID } from 'node:crypto';
import { prepareCashShifts } from './cash-shifts-setup';
import { BrowserSession, fixturePasswords } from './support/harness';
import type { CashShiftActor } from './cash-shifts.types';

export async function prepareCashMovements() {
  const f = await prepareCashShifts();
  const actors: Record<string, CashShiftActor> = {};
  const read = ['cash.registers.read', 'cash.shifts.read'];
  for (const [name, permissions] of Object.entries({
    owner: [...read, 'cash.shifts.open', 'cash.shifts.close', 'cash.movements.create'],
    limited: [...read, 'cash.shifts.open', 'cash.shifts.close', 'cash.movements.create'],
    reporter: [...read, 'cash.reports.read'],
    reporter2: [...read, 'cash.reports.read'],
    reader: [...read, 'cash.shifts.open'],
  })) {
    const { role } = await f.a.primary.expect('/roles', 'POST', {
      name: `Numerar ${name}`,
      permissions: permissions.map((permission) => ({
        permission,
        ...(name === 'limited' && permission === 'cash.movements.create'
          ? { limits: { maxAmount: '10' } }
          : {}),
      })),
    });
    const { user, pin } = await f.a.primary.expect('/staff', 'POST', {
      login: `drawer-${name}`,
      displayName: `Numerar ${name}`,
      authenticationMethod: 'PIN',
      locationIds: [f.locationId],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.locationId },
      ],
    });
    fixturePasswords.add(pin);
    actors[name] = { userId: user.id, pin, session: new BrowserSession('TENANT') };
  }
  for (const actor of Object.values(actors)) actor.session = await f.login(actor);
  const body = (version: number, changes: Record<string, unknown> = {}) => ({
    locationId: f.locationId,
    version,
    requestKey: randomUUID(),
    direction: 'IN',
    amount: '5',
    reason: 'Fond suplimentar documentat',
    ...changes,
  });
  const move = async (
    id: string,
    changes: Record<string, unknown> = {},
    actor = actors.owner!.session,
  ) => {
    const current = await f.detail(id, actor);
    const request = body(current.shift.version, changes);
    return {
      body: request,
      ...(await actor.expect(`/cash-shifts/${id}/movements`, 'POST', request)),
    };
  };
  const list = (id: string, actor = actors.owner!.session, query = '') =>
    actor.expect(`/cash-shifts/${id}/movements?locationId=${f.locationId}${query}`);
  return { ...f, movementActors: actors, body, move, list };
}
