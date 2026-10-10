import { randomUUID } from 'node:crypto';
import { prepareCustomerLookup } from './customer-lookup-setup';
import { completePacking } from './complete-packing';

export async function prepareCustomerAnalytics() {
  const f = await prepareCustomerLookup();
  const createCustomer = async () =>
    (await f.a.primary.expect('/customers', 'POST', f.registration())).customer;
  const current = async (id: string) => (await f.a.primary.expect(`/orders/${id}`)).order;
  const createOrder = async (customerId: string | null, extra: Record<string, unknown> = {}) =>
    (
      await f.a.primary.expect(
        '/orders',
        'POST',
        f.draft({
          serviceType: 'PICKUP',
          ...(customerId ? { customerRef: { id: customerId, version: 1 } } : {}),
          ...extra,
        }),
      )
    ).order;
  const finish = async (id: string, demo = false) => {
    const sent = await f.a.primary.expect(`/orders/${id}/send`, 'POST', {
      version: (await current(id)).version,
      requestKey: randomUUID(),
    });
    for (const [index, status] of ['PREPARING', 'READY'].entries())
      await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
        version: index + 1,
        status,
      });
    await completePacking(f.a.primary, id);
    await f.a.primary.expect(`/orders/${id}/${demo ? 'checkout/demo' : 'complete'}`, 'POST', {
      version: (await current(id)).version,
      requestKey: randomUUID(),
    });
    return current(id);
  };
  const collect = async (id: string, amount: string) => {
    await f.a.primary.expect(`/orders/${id}/payments`, 'POST', {
      version: (await current(id)).version,
      requestKey: randomUUID(),
      cashShiftId: (await f.cashShift()).id,
      confirmed: true,
      payments: [{ method: 'CASH', amount, receivedAmount: amount }],
    });
    return (await f.a.primary.expect(`/orders/${id}/payments`)).payments[0];
  };
  const refund = async (id: string, paymentId: string, amount: string) =>
    f.a.primary.expect(`/orders/${id}/refunds`, 'POST', {
      version: (await current(id)).version,
      requestKey: randomUUID(),
      cashShiftId: (await f.cashShift()).id,
      confirmed: true,
      reason: 'Rambursare pentru proba analitică',
      refunds: [{ paymentId, amount }],
    });
  return { ...f, createCustomer, current, createOrder, finish, collect, refund };
}
