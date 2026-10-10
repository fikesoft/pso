import { expect, it } from 'vitest';
import type { KitchenCourseResult } from '@pos/contracts';
import type { CoursePointer, CourseStorage } from '../model/course.types';
import {
  clearCoursePointer,
  coursePointerKey,
  readCoursePointer,
  storeCoursePointer,
  validateCourseResult,
} from './course-pointer';

function fixture() {
  const data = new Map<string, string>();
  const storage: CourseStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  const pointer: CoursePointer = {
    organizationId: 'org',
    actorUserId: 'actor',
    locationId: 'location',
    command: {
      ticketId: '00000000-0000-4000-8000-000000000001',
      requestKey: '00000000-0000-4000-8000-000000000002',
    },
  };
  return { storage, data, pointer };
}
it('recuperarea păstrează numai identitatea, separă contextele și refuză suprascrierea', () => {
  const { storage, data, pointer } = fixture();
  storeCoursePointer(storage, pointer);
  expect(readCoursePointer(storage, pointer)).toEqual(pointer);
  for (const patch of [
    { organizationId: 'other' },
    { actorUserId: 'other' },
    { locationId: 'other' },
  ])
    expect(readCoursePointer(storage, { ...pointer, ...patch })).toBeNull();
  expect(data.get(coursePointerKey(pointer))).not.toContain('version');
  expect(() =>
    storeCoursePointer(storage, {
      ...pointer,
      command: { ...pointer.command, requestKey: pointer.command.ticketId },
    }),
  ).toThrow();
  clearCoursePointer(storage, pointer);
  expect(readCoursePointer(storage, pointer)).toBeNull();
});
it('referințele corupte sau mutate în alt scope blochează o operație nouă', () => {
  const { storage, data, pointer } = fixture();
  for (const value of [
    '{',
    JSON.stringify({ ...pointer, actorUserId: 'other' }),
    JSON.stringify({ ...pointer, command: { ...pointer.command, course: 3 } }),
  ]) {
    data.set(coursePointerKey(pointer), value);
    expect(() => readCoursePointer(storage, pointer)).toThrow();
  }
});
it('rezultatul trebuie să aparțină tentativei și să aibă versiune, etapă și loturi valide', () => {
  const { pointer } = fixture();
  const result: KitchenCourseResult = {
    ...pointer.command,
    course: 2,
    expectedVersion: 1,
    version: 2,
    firedAt: '2026-10-04T00:00:00.000Z',
    batchIds: ['00000000-0000-4000-8000-000000000003'],
  };
  const attempt = { ...pointer.command, course: 2 as const, version: 1 };
  expect(() => validateCourseResult(pointer.command, result, attempt)).not.toThrow();
  for (const patch of [
    { ticketId: result.requestKey },
    { requestKey: result.ticketId },
    { version: 3 },
    { course: 3 as const },
    { expectedVersion: 0 },
    { firedAt: 'invalid' },
    { batchIds: [] },
    { batchIds: ['not-an-id'] },
    { batchIds: [result.batchIds[0]!, result.batchIds[0]!] },
  ])
    expect(() => validateCourseResult(pointer.command, { ...result, ...patch }, attempt)).toThrow();
});
