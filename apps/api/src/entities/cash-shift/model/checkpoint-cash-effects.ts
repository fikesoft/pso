import type { TenantTransaction } from '@pos/db';
/** Validate each immutable shift version before the next financial header advances it.
 * SET CONSTRAINTS does not commit: a later allocation failure still rolls back the whole batch.
 */
export async function checkpointCashEffects(tx: TenantTransaction) {
  await tx.$executeRaw`SET CONSTRAINTS cash_activity_effect_consistency, cash_shift_effect_consistency IMMEDIATE`;
  await tx.$executeRaw`SET CONSTRAINTS cash_activity_effect_consistency, cash_shift_effect_consistency DEFERRED`;
}
