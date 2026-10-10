import type { BillPlanCommandIdentity, BillPlanResolutionResponse } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { readBill } from './bill-response';
import { requireBillAccess, requireBillOrderRead } from './bill-access';
import { planCommandTarget, readPlanRetirement } from './plan-command';
export async function resolvePlan(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  command: BillPlanCommandIdentity,
): Promise<BillPlanResolutionResponse> {
  const { locationId, requestKey } = command;
  if (command.kind === 'VOID') await readBill(tx, access, actor, locationId, command.splitId);
  else {
    requireBillAccess(access, actor, locationId, command.context);
    if (command.context.kind === 'ORDER') {
      const order = await tx.order.findFirst({ where: { id: command.context.id, locationId } });
      assert(order, 404, 'Comanda nu există.');
      requireBillOrderRead(access, actor, locationId, order.total.toFixed(2));
    } else
      assert(
        await tx.tableVisit.findFirst({ where: { id: command.context.id, locationId } }),
        404,
        'Vizita nu există.',
      );
  }
  const retired = await readPlanRetirement(tx, access.org.id, actor, command);
  if (retired) return { status: 'RETIRED', command };
  if (command.kind === 'CREATE') {
    const split = await tx.billSplit.findFirst({ where: { locationId, requestKey } });
    if (split) {
      const target = planCommandTarget(command);
      assert(
        split.actorUserId === actor &&
          split.scopeType === command.context.kind &&
          split.targetOrderId === target.targetOrderId &&
          split.targetVisitId === target.targetVisitId,
        409,
        'Cheia aparține altei împărțiri sau altui operator.',
      );
      return {
        status: 'SUCCEEDED',
        command,
        result: { split: await readBill(tx, access, actor, locationId, split.id) },
      };
    }
  } else {
    const voided = await tx.billSplitVoid.findFirst({ where: { locationId, requestKey } });
    if (voided) {
      assert(
        voided.actorUserId === actor && voided.splitId === command.splitId,
        409,
        'Cheia aparține altei anulări sau altui operator.',
      );
      return {
        status: 'SUCCEEDED',
        command,
        result: { split: await readBill(tx, access, actor, locationId, voided.splitId) },
      };
    }
  }
  await tx.billPlanRetirement.create({
    data: {
      organizationId: access.org.id,
      locationId,
      requestKey,
      kind: command.kind,
      actorUserId: actor,
      ...planCommandTarget(command),
    },
  });
  return { status: 'RETIRED', command };
}
