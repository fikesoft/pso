import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { registerResponse } from '../../../entities/cash-register';
import { HttpError } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { requireRegisterAccess } from './register-access';
import { lockRegister, replayRegisterCommand, saveRegisterCommand } from './register-command';
import type { RegisterMutation } from './register-command.types';
export async function mutateRegister(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  command: RegisterMutation,
) {
  const { body } = command;
  requireRegisterAccess(access, actor, body.locationId, true);
  const identity = {
    locationId: body.locationId,
    requestKey: body.requestKey,
    kind: command.kind,
    ...(command.kind !== 'CREATE' ? { registerId: command.registerId } : {}),
  };
  const hash = requestHash({ organizationId: access.org.id, actor, ...command });
  const replay = await replayRegisterCommand(tx, identity, actor, hash);
  if (replay) return { register: replay, replayed: true };
  if (command.kind === 'CREATE') {
    if (
      await tx.cashRegister.findFirst({
        where: { locationId: body.locationId, code: command.body.code },
      })
    )
      throw new HttpError(
        409,
        'Codul casei este deja folosit în locație.',
        'CASH_REGISTER_CODE_EXISTS',
      );
    const row = await tx.cashRegister.create({
      data: {
        organizationId: access.org.id,
        locationId: body.locationId,
        code: command.body.code,
        name: command.body.name,
        createdByUserId: actor,
        updatedByUserId: actor,
        creationRequestKey: body.requestKey,
        lastRequestKey: body.requestKey,
        lastRequestHash: hash,
      },
    });
    await saveRegisterCommand(tx, row, identity, null);
    return { register: registerResponse(row), replayed: false };
  }
  const current = await lockRegister(tx, body.locationId, command.registerId);
  if (current.status !== 'ACTIVE')
    throw new HttpError(409, 'Casa este arhivată.', 'CASH_REGISTER_ARCHIVED');
  if (current.version !== command.body.version)
    throw new HttpError(
      409,
      'Casa a fost modificată. Reîncărcați.',
      'CASH_REGISTER_VERSION_CONFLICT',
    );
  if (
    command.kind === 'ARCHIVE' &&
    (await tx.cashShift.findFirst({ where: { registerId: current.id, status: 'OPEN' } }))
  )
    throw new HttpError(
      409,
      'Casa are o tură deschisă. Închideți tura înainte de arhivare.',
      'CASH_REGISTER_HAS_OPEN_SHIFT',
    );
  if (
    command.kind === 'ARCHIVE' &&
    (await tx.orderResponsibility.findFirst({
      where: { registerId: current.id, state: 'PENDING_HANDOFF' },
    }))
  )
    throw new HttpError(409, 'Casa are predări în așteptare.', 'CASH_REGISTER_PENDING_HANDOFF');
  const row = await tx.cashRegister.update({
    where: { id: current.id, version: current.version },
    data: {
      ...(command.kind === 'RENAME' ? { name: command.body.name } : { status: 'ARCHIVED' }),
      version: { increment: 1 },
      updatedByUserId: actor,
      lastRequestKey: body.requestKey,
      lastRequestHash: hash,
    },
  });
  await saveRegisterCommand(tx, row, identity, command.body.version);
  return { register: registerResponse(row), replayed: false };
}
