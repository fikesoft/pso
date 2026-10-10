import { randomUUID } from 'node:crypto';
import { prepareCashMovements } from './cash-movements-setup';

export async function prepareCashDiscrepancies() {
  const f = await prepareCashMovements();
  const actor = f.movementActors.owner!.session;
  const closings = [];
  for (const countedCash of ['9', '10', '12']) {
    const opened = await f.open(actor, '10');
    const closed = await f.close(opened.shift.id, actor, {
      countedCash,
      ...(countedCash === '10' ? {} : { discrepancyReason: 'Diferență documentată la numărare' }),
    });
    closings.push({ ...opened, ...closed });
  }
  const renamed = closings[0]!;
  await f.a.primary.expect(`/cash-registers/${renamed.register.id}`, 'PATCH', {
    locationId: f.locationId,
    requestKey: randomUUID(),
    version: 1,
    name: 'Denumire nouă la a doua închidere',
  });
  const { shift } = await actor.expect(`/cash-registers/${renamed.register.id}/open`, 'POST', {
    locationId: f.locationId,
    requestKey: randomUUID(),
    openingAmount: '20',
  });
  const second = await f.close(shift.id, actor, {
    countedCash: '21',
    discrepancyReason: 'Surplus în a doua tură',
  });
  closings.push({
    register: renamed.register,
    shift: second.shift,
    body: second.body,
    closing: second.closing,
  });
  await f.a.primary.expect(`/cash-registers/${renamed.register.id}/archive`, 'POST', {
    locationId: f.locationId,
    requestKey: randomUUID(),
    version: 2,
  });
  const managerTarget = await f.open(actor, '5');
  const managerClosed = await f.close(managerTarget.shift.id, f.a.primary, {
    countedCash: '4',
    discrepancyReason: 'Lipsă constată la predare',
    managerReason: 'Operatorul a părăsit locația',
  });
  closings.push({ ...managerTarget, ...managerClosed });
  const open = await f.open(actor, '0');
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Chisinau' }).format(
    new Date(closings[0]!.closing.closedAt),
  );
  const query = (changes: Record<string, string> = {}) =>
    new URLSearchParams({
      locationId: f.locationId,
      closedFrom: date,
      closedTo: date,
      ...changes,
    }).toString();
  const report = (
    changes: Record<string, string> = {},
    session = f.movementActors.reporter!.session,
  ) => session.expect(`/cash-shifts/discrepancies?${query(changes)}`);
  const options = (
    changes: Record<string, string> = {},
    session = f.movementActors.reporter!.session,
  ) => session.expect(`/cash-shifts/discrepancy-registers?${query(changes)}`);
  return { ...f, closings, open, date, query, report, options };
}
