import { afterAll, beforeAll, it } from 'vitest';
import { prepareCashShifts } from './api/cash-shifts-setup';
import { verifyShiftMfa } from './api/cash-shifts-privileges';
import { closeOperations } from './api/operations-setup';
import { verifyShiftAccess, verifyShiftLimits, verifyShiftList } from './api/cash-shifts-access';
import {
  verifyShiftOpenClose,
  verifyShiftManagerClose,
  verifyShiftRaces,
} from './api/cash-shifts-lifecycle';
import type { CashShiftsFixture } from './api/cash-shifts.types';

let f: CashShiftsFixture;
beforeAll(async () => {
  f = await prepareCashShifts();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
it('ture: acces propriu PIN, scope, DENY, limite OPEN, CSRF și no-store', async () =>
  verifyShiftAccess(f));
it('ture: contractul limitelor refuză drepturile fără bază monetară', async () =>
  verifyShiftLimits(f));
it('ture: MINE implicit, ALL protejat și cursor legat de filtre', async () => verifyShiftList(f));
it('ture: OPEN/CLOSE și replay păstrează snapshotul, arhivarea cere închidere', async () =>
  verifyShiftOpenClose(f));
it('ture: închiderea managerială păstrează ownerul și cere motive independente', async () =>
  verifyShiftManagerClose(f));
it('ture: concurența HTTP OPEN/archive și CLOSE/CLOSE are un singur efect', async () =>
  verifyShiftRaces(f));

it('ture: close-others este privilegiat și cere MFA înaintea închiderii manageriale', async () =>
  verifyShiftMfa(f));
