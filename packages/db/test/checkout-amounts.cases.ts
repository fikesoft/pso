import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { checkoutData, prepareCheckoutOrder, writeCheckout } from './fixtures/checkout.fixture';
import { publishKitchenFixture } from './fixtures/operations-kitchen.fixture';
import type { OperationsFixture } from './fixtures/operations.types';

export async function runCheckoutAmountTests(
  t: TestContext,
  state: OperationsFixture,
  cashShiftId: string,
) {
  await t.test(
    'SQL runtime nu poate trimite fără rezervare și nu poate finaliza fără consum',
    async () => {
      const draft = await state.createDraft();
      await assert.rejects(publishKitchenFixture(state, draft, { omitReservation: true }));
      assert.equal(
        (await state.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: draft.order.id } })))
          .status,
        'DRAFT',
      );
      assert.equal(
        await state.txA((tx) => tx.kitchenTicket.count({ where: { orderId: draft.order.id } })),
        0,
      );
      const ready = await prepareCheckoutOrder(state);
      const data = await checkoutData(state, ready);
      await assert.rejects(
        state.txA(async (tx) => {
          await tx.checkout.create({ data });
          await tx.$executeRaw`UPDATE "Order" SET status='COMPLETED',version=version+1 WHERE id=${ready.id}::uuid`;
        }),
      );
      assert.equal(await state.txA((tx) => tx.checkout.count({ where: { orderId: ready.id } })), 0);
      assert.equal(
        (
          await state.txA((tx) =>
            tx.inventoryReservation.findFirstOrThrow({ where: { orderId: ready.id } }),
          )
        ).status,
        'PENDING',
      );
    },
  );
  await t.test('DEMO finalizează comanda fără plată, cu sume de încasare/rest NULL', async () => {
    const order = await prepareCheckoutOrder(state);
    const { checkout, payment } = await writeCheckout(state, order);
    assert.equal(checkout.mode, 'DEMO');
    assert.equal(checkout.method, null);
    assert.equal(checkout.receivedAmount, null);
    assert.equal(checkout.changeAmount, null);
    assert.equal(payment, null);
    assert.equal(await state.txA((tx) => tx.payment.count({ where: { orderId: order.id } })), 0);
    assert.equal(
      (await state.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }))).status,
      'COMPLETED',
    );
    await assert.rejects(
      state.txA((tx) =>
        tx.payment.create({
          data: {
            organizationId: state.a.organization.id,
            locationId: order.locationId,
            checkoutId: checkout.id,
            orderId: order.id,
            amount: order.total,
            method: 'CASH',
            confirmedByUserId: state.a.user.id,
          },
        }),
      ),
    );
  });
  await t.test('încasarea cash/card este exact totalul, iar restul nu devine venit', async () => {
    const cashOrder = await prepareCheckoutOrder(state);
    const cash = await writeCheckout(state, cashOrder, {
      mode: 'MANUAL',
      cashShiftId,
      method: 'CASH',
      receivedAmount: '20.00',
      changeAmount: '9.99',
    });
    assert.equal(cash.checkout.receivedAmount?.toFixed(2), '20.00');
    assert.equal(cash.checkout.changeAmount?.toFixed(2), '9.99');
    assert.equal(cash.payment?.amount.toFixed(2), '10.01');
    assert.equal(cash.payment?.origin, 'MANUAL');
    const cardOrder = await prepareCheckoutOrder(state);
    const card = await writeCheckout(state, cardOrder, {
      mode: 'MANUAL',
      cashShiftId,
      method: 'CARD',
      receivedAmount: cardOrder.total,
      changeAmount: '0.00',
    });
    assert.equal(card.payment?.method, 'CARD');
    assert.equal(card.payment?.amount.toFixed(2), '10.01');
    assert.equal(card.checkout.changeAmount?.toFixed(2), '0.00');
    const freeOrder = await prepareCheckoutOrder(state, true);
    const free = await writeCheckout(state, freeOrder, {
      mode: 'MANUAL',
      cashShiftId,
      method: 'CASH',
      receivedAmount: '0',
      changeAmount: '0',
    });
    assert.equal(free.payment?.amount.toFixed(2), '0.00');
  });
  await t.test('DB respinge total/rest fals, sume nonfinite și metode incompatibile', async () => {
    const order = await prepareCheckoutOrder(state);
    for (const overrides of [
      { total: '10.02' },
      { total: '-1' },
      { total: 'NaN' },
      { currency: 'EUR' },
      { mode: 'UNKNOWN' },
      { method: 'CASH' },
      { receivedAmount: '20' },
      { mode: 'MANUAL', cashShiftId, receivedAmount: '10.01', changeAmount: '0' },
      { mode: 'MANUAL', cashShiftId, method: 'CASH', receivedAmount: '10.00', changeAmount: '0' },
      { mode: 'MANUAL', cashShiftId, method: 'CASH', receivedAmount: '20', changeAmount: '10' },
      { mode: 'MANUAL', cashShiftId, method: 'CASH', receivedAmount: 'NaN', changeAmount: '0' },
      { mode: 'MANUAL', cashShiftId, method: 'CARD', receivedAmount: '20', changeAmount: '9.99' },
      { mode: 'MANUAL', cashShiftId, method: 'CARD', receivedAmount: '10.01', changeAmount: null },
    ]) {
      await assert.rejects(writeCheckout(state, order, overrides));
    }
    assert.equal(await state.txA((tx) => tx.checkout.count({ where: { orderId: order.id } })), 0);
  });
  await t.test(
    'finalizarea cere OPEN+READY, checkout și plată manuală în aceeași tranzacție',
    async () => {
      const draft = await state.createDraft();
      await assert.rejects(writeCheckout(state, draft.order));
      await publishKitchenFixture(state, draft);
      const open = await state.txA((tx) =>
        tx.order.findUniqueOrThrow({ where: { id: draft.order.id } }),
      );
      await assert.rejects(writeCheckout(state, open));
      const ready = await prepareCheckoutOrder(state);
      await assert.rejects(
        state.txA((tx) =>
          tx.order.update({
            where: { id: ready.id },
            data: { status: 'COMPLETED', version: { increment: 1 } },
          }),
        ),
      );
      await assert.rejects(writeCheckout(state, ready, {}, { skipCompletion: true }));
      await assert.rejects(
        writeCheckout(
          state,
          ready,
          {
            mode: 'MANUAL',
            cashShiftId,
            method: 'CARD',
            receivedAmount: ready.total,
            changeAmount: '0',
          },
          { skipPayment: true },
        ),
      );
      assert.equal(await state.txA((tx) => tx.checkout.count({ where: { orderId: ready.id } })), 0);
      assert.equal(
        (await state.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: ready.id } }))).status,
        'READY',
      );
    },
  );
  await t.test(
    'Payment trebuie să coincidă cu totalul, metoda, comanda și casierul Checkout',
    async () => {
      const ready = await prepareCheckoutOrder(state);
      const other = await prepareCheckoutOrder(state);
      for (const payment of [
        { amount: '20' },
        { currency: 'EUR' },
        { method: 'CARD' },
        { origin: 'AUTOMATIC' },
        { confirmedByUserId: state.b.user.id },
        { orderId: other.id },
        { locationId: state.locationA2.id },
      ]) {
        await assert.rejects(
          writeCheckout(
            state,
            ready,
            {
              mode: 'MANUAL',
              cashShiftId,
              method: 'CASH',
              receivedAmount: '20',
              changeAmount: '9.99',
            },
            { payment },
          ),
        );
      }
    },
  );
}
