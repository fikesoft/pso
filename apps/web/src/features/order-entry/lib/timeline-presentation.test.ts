import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, KITCHEN_STATUSES } from '@pos/contracts/orders';
import { DELIVERY_STATUSES } from '@pos/contracts/delivery';
import { orderTimelineMessages } from '@pos/ui/locales';
import type { PaymentStatus } from '@pos/contracts';
import { timelineStatus } from './timeline-presentation';

describe('timeline status presentation', () => {
  it('has localized labels for every current order, kitchen and delivery state', () => {
    for (const status of [...ORDER_STATUSES, ...KITCHEN_STATUSES, ...DELIVERY_STATUSES]) {
      expect(orderTimelineMessages.statuses).toHaveProperty(status);
      expect(timelineStatus(status)).not.toBe(status);
      expect(timelineStatus(status)).not.toContain('_');
    }
  });
  it('covers the complete payment status type', () => {
    const labels: Record<PaymentStatus, string> = orderTimelineMessages.statuses;
    for (const status of ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'])
      expect(timelineStatus(status)).toBe(labels[status as PaymentStatus]);
  });
  it('distinguishes missing historical states from known legacy states', () => {
    expect(timelineStatus(null)).toBe('Stare neînregistrată');
    expect(timelineStatus('OPEN')).toBe('Deschisă (stare istorică)');
    expect(timelineStatus('NEW')).toBe('Nouă (stare istorică)');
    expect(timelineStatus('UNRECOGNIZED_STATE')).toBe('unrecognized state');
  });
});
