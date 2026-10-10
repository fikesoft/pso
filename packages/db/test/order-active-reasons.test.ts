import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { activeOrderReasonsSql } from '../../../apps/api/src/features/orders/model/order-active-sql';

test('PostgreSQL: fragmentul SQL real clasifică independent bani/operațional/livrare inclusiv stări istorice', async () => {
  const f = await createOperationsFixture();
  try {
    const rows = await f.txA((tx) =>
      tx.$queryRaw<Array<{ label: string; reasons: string[] }>>(Prisma.sql`
      WITH s(label,status,"serviceType","deliveryStatus",total,collected,refunded,demo) AS (VALUES
        ('draft','DRAFT','DELIVERY','WAITING_COURIER',10.01::numeric,0::numeric,0::numeric,false),
        ('open','OPEN','DINE_IN',NULL,10.01,0,0,false),
        ('ready-paid','READY','DELIVERY','ASSIGNED',10.01,10.01,0,false),
        ('complete-paid','COMPLETED','DINE_IN',NULL,10.01,10.01,0,false),
        ('complete-unpaid','COMPLETED','DINE_IN',NULL,10.01,0,0,false),
        ('cent','COMPLETED','DINE_IN',NULL,10.01,10,0,false),
        ('refund','COMPLETED','DELIVERY','FAILED',10.01,10.01,0.01,false),
        ('refund-repaid','COMPLETED','DINE_IN',NULL,10.01,10.02,0.01,false),
        ('full-refund','COMPLETED','DINE_IN',NULL,10.01,10.01,10.01,false),
        ('cancelled-paid','CANCELLED','DELIVERY','ASSIGNED',10.01,10.01,0,false),
        ('cancelled-refunded','CANCELLED','DELIVERY',NULL,10.01,10.01,10.01,false),
        ('unknown','COMPLETED','DELIVERY',NULL,10.01,10.01,0,false),
        ('delivered','COMPLETED','DELIVERY','DELIVERED',10.01,10.01,0,false),
        ('demo','COMPLETED','DINE_IN',NULL,10.01,0,0,true),
        ('demo-delivery','COMPLETED','DELIVERY',NULL,10.01,0,0,true),
        ('zero','COMPLETED','DINE_IN',NULL,0,0,0,false)
      ) SELECT label,${activeOrderReasonsSql()} AS reasons FROM s`),
    );
    assert.deepEqual(Object.fromEntries(rows.map((row) => [row.label, row.reasons])), {
      draft: ['OPERATIONAL'],
      open: ['OPERATIONAL', 'PAYMENT_OUTSTANDING'],
      'ready-paid': ['OPERATIONAL', 'DELIVERY_PENDING'],
      'complete-paid': [],
      'complete-unpaid': ['PAYMENT_OUTSTANDING'],
      cent: ['PAYMENT_OUTSTANDING'],
      refund: ['FINANCIAL_REVIEW', 'DELIVERY_PENDING'],
      'refund-repaid': [],
      'full-refund': ['FINANCIAL_REVIEW'],
      'cancelled-paid': ['FINANCIAL_REVIEW'],
      'cancelled-refunded': [],
      unknown: ['DELIVERY_UNKNOWN'],
      delivered: [],
      demo: [],
      'demo-delivery': ['DELIVERY_UNKNOWN'],
      zero: [],
    });
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
