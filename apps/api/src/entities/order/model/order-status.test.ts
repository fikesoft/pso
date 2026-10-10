import { describe, expect, it } from 'vitest';
import {
  canPrepareKitchen,
  effectiveKitchenStatus,
  effectiveOrderStatus,
  orderStatusFilter,
} from './order-status';

describe('operational order stages and preserved legacy records', () => {
  it('maps each historical OPEN stage without rewriting it', () => {
    expect(effectiveOrderStatus('OPEN', 'NEW')).toBe('CONFIRMED');
    expect(effectiveOrderStatus('OPEN', 'PREPARING')).toBe('IN_PROGRESS');
    expect(effectiveOrderStatus('OPEN', 'READY')).toBe('READY');
    expect(effectiveKitchenStatus('NEW')).toBe('QUEUED');
    expect(effectiveOrderStatus('CANCELLED', 'PREPARING')).toBe('CANCELLED');
    expect(() => effectiveOrderStatus('INVALID', 'READY')).toThrow();
  });
  it('permits partial readiness but rejects skipped, reversed and terminal preparation', () => {
    for (const [from, to] of [
      ['QUEUED', 'PREPARING'],
      ['NEW', 'PREPARING'],
      ['PREPARING', 'PARTIALLY_READY'],
      ['PREPARING', 'READY'],
      ['PARTIALLY_READY', 'READY'],
    ]) {
      expect(canPrepareKitchen(from!, to!)).toBe(true);
    }
    for (const [from, to] of [
      ['QUEUED', 'READY'],
      ['PARTIALLY_READY', 'PREPARING'],
      ['READY', 'PREPARING'],
      ['CANCELLED', 'READY'],
      ['PREPARING', 'PREPARING'],
    ]) {
      expect(canPrepareKitchen(from!, to!)).toBe(false);
    }
  });
  it('includes the matching legacy stage before list pagination', () => {
    expect(orderStatusFilter('READY')).toEqual({
      OR: [{ status: 'READY' }, { status: 'OPEN', kitchenStatus: { in: ['READY'] } }],
    });
    expect(orderStatusFilter('CONFIRMED')).toEqual({
      OR: [{ status: 'CONFIRMED' }, { status: 'OPEN', kitchenStatus: { in: ['NEW', 'QUEUED'] } }],
    });
    expect(orderStatusFilter('CANCELLED')).toEqual({ status: 'CANCELLED' });
  });
});
