import { expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@pos/db';
import type { StoredRegisterCommand } from '../../../entities/cash-register';
import { readRegisterCommand, replayRegisterCommand } from './register-command';
function storedCommand(overrides: Partial<StoredRegisterCommand> = {}): StoredRegisterCommand {
  return {
    id: 'command',
    organizationId: 'org',
    locationId: 'location',
    requestKey: 'key',
    kind: 'CREATE',
    actorUserId: 'actor',
    status: 'SUCCEEDED',
    registerId: 'register',
    requestHash: 'hash',
    expectedVersion: null,
    resultCode: 'CASA',
    resultName: 'Numele original',
    resultStatus: 'ACTIVE',
    resultVersion: 1,
    resultCreatedAt: new Date('2026-09-27T00:00:00.123Z'),
    resultUpdatedAt: new Date('2026-09-27T00:00:00.123Z'),
    createdAt: new Date(),
    ...overrides,
  };
}
function transaction(claim: StoredRegisterCommand | null) {
  return {
    cashRegisterCommand: { findFirst: vi.fn().mockResolvedValue(claim) },
  } as unknown as TenantTransaction;
}
it('replay returnează snapshotul imuabil, fără citirea registrului curent', async () => {
  const identity = { kind: 'CREATE' as const, locationId: 'location', requestKey: 'key' };
  const row = await replayRegisterCommand(transaction(storedCommand()), identity, 'actor', 'hash');
  expect(row).toMatchObject({
    name: 'Numele original',
    version: 1,
    updatedAt: '2026-09-27T00:00:00.123Z',
  });
  await expect(
    replayRegisterCommand(transaction(storedCommand()), identity, 'actor', 'changed'),
  ).rejects.toMatchObject({ code: 'CASH_REGISTER_REQUEST_CONFLICT' });
  await expect(
    replayRegisterCommand(
      transaction(storedCommand({ status: 'RETIRED' })),
      identity,
      'actor',
      'hash',
    ),
  ).rejects.toMatchObject({ code: 'CASH_REGISTER_REQUEST_RETIRED' });
});
it('cheia resolverului este legată de actor, kind și țintă', async () => {
  const claim = storedCommand({ kind: 'RENAME' });
  const identity = {
    kind: 'RENAME' as const,
    locationId: 'location',
    requestKey: 'key',
    registerId: 'register',
  };
  await expect(readRegisterCommand(transaction(claim), identity, 'other')).rejects.toMatchObject({
    code: 'CASH_REGISTER_REQUEST_CONFLICT',
  });
  await expect(
    readRegisterCommand(transaction(claim), { ...identity, kind: 'ARCHIVE' }, 'actor'),
  ).rejects.toMatchObject({ code: 'CASH_REGISTER_REQUEST_CONFLICT' });
  await expect(
    readRegisterCommand(transaction(claim), { ...identity, registerId: 'other' }, 'actor'),
  ).rejects.toMatchObject({ code: 'CASH_REGISTER_REQUEST_CONFLICT' });
});
