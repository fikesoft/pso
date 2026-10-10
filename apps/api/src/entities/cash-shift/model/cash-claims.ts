import type { CashCommandIdentity } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { HttpError } from '../../../shared/lib/http';
export function cashClaimIdentity(command: CashCommandIdentity) {
  return {
    locationId: command.locationId,
    requestKey: command.requestKey,
    kind: command.kind,
    family:
      command.kind === 'OPEN' ||
      command.kind === 'CLOSE' ||
      command.kind === 'CASH_IN' ||
      command.kind === 'CASH_OUT'
        ? 'CASH'
        : command.kind === 'CHECKOUT_MANUAL'
          ? 'CHECKOUT'
          : 'PAYMENT',
    orderId: 'orderId' in command ? command.orderId : null,
    registerId: command.kind === 'OPEN' ? command.registerId : null,
    shiftId: 'shiftId' in command ? command.shiftId : null,
  };
}
export async function readCashClaim(
  tx: TenantTransaction,
  command: CashCommandIdentity,
  actor: string,
) {
  const identity = cashClaimIdentity(command);
  const claim = await tx.cashCommandClaim.findFirst({
    where: {
      locationId: identity.locationId,
      family: identity.family,
      requestKey: identity.requestKey,
    },
  });
  if (
    claim &&
    (claim.actorUserId !== actor ||
      claim.kind !== identity.kind ||
      claim.orderId !== identity.orderId ||
      claim.registerId !== identity.registerId ||
      claim.shiftId !== identity.shiftId)
  )
    throw new HttpError(
      409,
      'Cheia aparține altei operațiuni sau altui operator.',
      'CASH_COMMAND_CONFLICT',
    );
  return claim;
}
export function rejectRetiredCashClaim(status?: string) {
  if (status === 'RETIRED')
    throw new HttpError(
      409,
      'Tentativa a fost retrasă. Inițiați o operațiune nouă.',
      'CASH_COMMAND_RETIRED',
    );
}
export async function retireCashClaim(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  command: CashCommandIdentity,
) {
  return tx.cashCommandClaim.create({
    data: { organizationId, actorUserId: actor, status: 'RETIRED', ...cashClaimIdentity(command) },
  });
}
