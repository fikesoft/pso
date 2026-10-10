import { afterAll, beforeAll, it } from 'vitest';
import { prepareCashRegisters } from './api/cash-registers-setup';
import { verifyRegisterAccess } from './api/cash-registers-access';
import { verifyRegisterLifecycle, verifyRegisterResolution } from './api/cash-registers-lifecycle';
import { verifyRegisterHttpRaces, verifyRegisterPagination } from './api/cash-registers-pagination';
import { closeOperations } from './api/operations-setup';
import { verifyRegisterRevocation } from './api/cash-registers-revocation';
import type { CashRegistersFixture } from './api/cash-registers.types';

let f: CashRegistersFixture;
beforeAll(async () => {
  f = await prepareCashRegisters();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
it('case: scope, read/manage, DENY, MFA, CSRF și no-store', async () => verifyRegisterAccess(f));
it('case: ciclul terminal și replay păstrează snapshoturile imuabile', async () =>
  verifyRegisterLifecycle(f));
it('case: rezoluția retrage definitiv cheia și leagă kind/ținta/actorul', async () =>
  verifyRegisterResolution(f));
it('case: cursorul opac și codul imuabil păstrează paginarea la redenumire', async () =>
  verifyRegisterPagination(f));
it('case: concurența HTTP deduplică și serializează versionarea/rezoluția', async () =>
  verifyRegisterHttpRaces(f));
it('case: revocarea provenienței blochează replay și rezoluția după reautentificare', async () =>
  verifyRegisterRevocation(f));
