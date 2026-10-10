import type { KitchenCourseBatchState, KitchenFireTarget } from './course.types';

/** Input must contain every batch of one authorized ticket, without a station filter. */
export function pendingKitchenCourseBatches(
  batches: readonly KitchenCourseBatchState[],
  course: KitchenFireTarget,
): string[] {
  return batches
    .filter(
      (batch) =>
        batch.courseNumber !== 0 &&
        (course === 'ALL' || batch.courseNumber === course) &&
        batch.firedAt === null &&
        batch.status === 'QUEUED',
    )
    .map((batch) => batch.id)
    .sort();
}
