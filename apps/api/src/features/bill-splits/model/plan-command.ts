import type { BillPlanCommandIdentity } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { HttpError } from '../../../shared/lib/http';
export function planCommandTarget(identity: BillPlanCommandIdentity) {
  return {
    targetOrderId:
      identity.kind === 'CREATE' && identity.context.kind === 'ORDER' ? identity.context.id : null,
    targetVisitId:
      identity.kind === 'CREATE' && identity.context.kind === 'VISIT' ? identity.context.id : null,
    targetSplitId: identity.kind === 'VOID' ? identity.splitId : null,
  };
}
export async function readPlanRetirement(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  identity: BillPlanCommandIdentity,
) {
  await tx.$executeRaw`SELECT public.prepare_bill_plan_command(${organizationId}::uuid,${identity.locationId}::uuid,${identity.kind}::text,${identity.requestKey}::uuid)`;
  const retired = await tx.billPlanRetirement.findFirst({
    where: {
      locationId: identity.locationId,
      kind: identity.kind,
      requestKey: identity.requestKey,
    },
  });
  const target = planCommandTarget(identity);
  if (
    retired &&
    (retired.actorUserId !== actor ||
      retired.targetOrderId !== target.targetOrderId ||
      retired.targetVisitId !== target.targetVisitId ||
      retired.targetSplitId !== target.targetSplitId)
  )
    throw new HttpError(
      409,
      'Cheia aparține altei tentative sau altui operator.',
      'BILL_PLAN_COMMAND_CONFLICT',
    );
  return retired;
}
export async function rejectRetiredPlan(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  identity: BillPlanCommandIdentity,
) {
  if (await readPlanRetirement(tx, organizationId, actor, identity))
    throw new HttpError(
      409,
      'Tentativa a fost retrasă. Inițiați o operațiune nouă.',
      'BILL_PLAN_COMMAND_RETIRED',
    );
}
