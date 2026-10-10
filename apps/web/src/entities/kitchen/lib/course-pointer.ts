import {
  resolveKitchenCourseSchema,
  kitchenFireTargetSchema,
  idSchema,
} from '@pos/contracts/kitchen-courses';
import type { KitchenCourseResult, ResolveKitchenCourseInput } from '@pos/contracts';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type {
  CourseAttempt,
  CoursePointer,
  CoursePointerScope,
  CourseStorage,
} from '../model/course.types';

export function sameCourseCommand(a: ResolveKitchenCourseInput, b: ResolveKitchenCourseInput) {
  return (
    JSON.stringify(resolveKitchenCourseSchema.parse(a)) ===
    JSON.stringify(resolveKitchenCourseSchema.parse(b))
  );
}
export function coursePointerKey(scope: CoursePointerScope) {
  return `pos.kitchen-course:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readCoursePointer(
  storage: CourseStorage,
  scope: CoursePointerScope,
): CoursePointer | null {
  const raw = storage.getItem(coursePointerKey(scope));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (
      Object.keys(value).sort().join(',') !== 'actorUserId,command,locationId,organizationId' ||
      value.organizationId !== scope.organizationId ||
      value.actorUserId !== scope.actorUserId ||
      value.locationId !== scope.locationId
    )
      throw new Error(text.invalid);
    return { ...scope, command: resolveKitchenCourseSchema.parse(value.command) };
  } catch {
    throw new Error(text.invalid);
  }
}
export function storeCoursePointer(storage: CourseStorage, pointer: CoursePointer) {
  const previous = readCoursePointer(storage, pointer);
  if (previous && !sameCourseCommand(previous.command, pointer.command))
    throw new Error(text.conflict);
  storage.setItem(coursePointerKey(pointer), JSON.stringify(pointer));
  const stored = readCoursePointer(storage, pointer);
  if (!stored || !sameCourseCommand(stored.command, pointer.command)) throw new Error(text.storage);
}
export function clearCoursePointer(storage: CourseStorage, pointer: CoursePointer) {
  const previous = readCoursePointer(storage, pointer);
  if (previous && !sameCourseCommand(previous.command, pointer.command))
    throw new Error(text.conflict);
  storage.removeItem(coursePointerKey(pointer));
  if (storage.getItem(coursePointerKey(pointer)) !== null) throw new Error(text.storage);
}
export function validateCourseResult(
  command: ResolveKitchenCourseInput,
  result: KitchenCourseResult,
  attempt?: CourseAttempt,
) {
  if (
    !sameCourseCommand(command, { ticketId: result.ticketId, requestKey: result.requestKey }) ||
    !Number.isInteger(result.expectedVersion) ||
    result.expectedVersion < 1 ||
    result.expectedVersion > 2147483646 ||
    result.version !== result.expectedVersion + 1 ||
    !Number.isFinite(Date.parse(result.firedAt)) ||
    !Array.isArray(result.batchIds) ||
    result.batchIds.length === 0 ||
    new Set(result.batchIds).size !== result.batchIds.length ||
    (attempt && (result.expectedVersion !== attempt.version || result.course !== attempt.course))
  )
    throw new Error(text.invalid);
  kitchenFireTargetSchema.parse(result.course);
  result.batchIds.forEach((id) => idSchema.parse(id));
}
