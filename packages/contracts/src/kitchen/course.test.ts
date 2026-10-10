import { describe, expect, it } from 'vitest';
import {
  fireKitchenCourseSchema,
  kitchenCourseSchema,
  resolveKitchenCourseSchema,
} from './course.schema';
import { pendingKitchenCourseBatches } from './course-selection';
import type { KitchenCourseBatchState } from './course.types';

describe('contractul etapelor mesei', () => {
  it('distinge trimiterea imediată de cele trei etape și respinge valori ambigue', () => {
    for (const course of [0, 1, 2, 3]) expect(kitchenCourseSchema.parse(course)).toBe(course);
    for (const course of [-1, 4, 1.5, '1', null, undefined, true])
      expect(kitchenCourseSchema.safeParse(course).success).toBe(false);
  });

  it('cere versiune și cheie, fără scope sau stație controlate de payload', () => {
    const input = { version: 1, requestKey: '00000000-0000-4000-8000-000000000001', course: 1 };
    for (const course of [1, 2, 3, 'ALL'])
      expect(fireKitchenCourseSchema.safeParse({ ...input, course }).success).toBe(true);
    for (const patch of [
      { course: 0 },
      { course: '1' },
      { course: 4 },
      { version: 0 },
      { version: 1.5 },
      { requestKey: undefined },
      { organizationId: input.requestKey },
      { locationId: input.requestKey },
      { stationId: input.requestKey },
      { firedAt: '2026-10-04T10:00:00Z' },
    ])
      expect(fireKitchenCourseSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });

  it('recuperarea identifică tichetul și tentativa, fără un corp nou de executat', () => {
    const input = {
      ticketId: '00000000-0000-4000-8000-000000000001',
      requestKey: '00000000-0000-4000-8000-000000000002',
    };
    expect(resolveKitchenCourseSchema.parse(input)).toEqual(input);
    expect(resolveKitchenCourseSchema.safeParse({ ...input, course: 'ALL' }).success).toBe(false);
    expect(resolveKitchenCourseSchema.safeParse({ ...input, ticketId: undefined }).success).toBe(
      false,
    );
  });
});

describe('selectarea loturilor pentru lansare', () => {
  const batches: readonly KitchenCourseBatchState[] = [
    { id: 'main-bar', courseNumber: 2, firedAt: null, status: 'QUEUED' },
    { id: 'dessert', courseNumber: 3, firedAt: null, status: 'QUEUED' },
    { id: 'main-kitchen', courseNumber: 2, firedAt: null, status: 'QUEUED' },
    { id: 'starter', courseNumber: 1, firedAt: '2026-10-04T10:00:00Z', status: 'QUEUED' },
    { id: 'immediate', courseNumber: 0, firedAt: null, status: 'QUEUED' },
    { id: 'cancelled', courseNumber: 3, firedAt: null, status: 'CANCELLED' },
    { id: 'ready', courseNumber: 1, firedAt: '2026-10-04T10:00:00Z', status: 'READY' },
  ];

  it('lansează etapa în toate stațiile, fără să lanseze desertul', () => {
    expect(pendingKitchenCourseBatches(batches, 2)).toEqual(['main-bar', 'main-kitchen']);
    expect(pendingKitchenCourseBatches(batches, 1)).toEqual([]);
  });

  it('ALL exclude loturile deja lansate, imediate sau anulate și nu schimbă intrarea', () => {
    const snapshot = structuredClone(batches);
    expect(pendingKitchenCourseBatches(batches, 'ALL')).toEqual([
      'dessert',
      'main-bar',
      'main-kitchen',
    ]);
    expect(pendingKitchenCourseBatches([...batches].reverse(), 'ALL')).toEqual([
      'dessert',
      'main-bar',
      'main-kitchen',
    ]);
    expect(batches).toEqual(snapshot);
    expect(pendingKitchenCourseBatches([], 'ALL')).toEqual([]);
  });
});
