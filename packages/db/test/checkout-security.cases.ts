import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { checkoutData, prepareCheckoutOrder, writeCheckout } from './fixtures/checkout.fixture';
import type { OperationsFixture, OperationsRlsStatus } from './fixtures/operations.types';

export async function runCheckoutSecurityTests(
  t: TestContext,
  state: OperationsFixture,
  cashShiftId: string,
) {
  const { txA, txB, runtime, auth, platform } = state;
  await t.test('identitatea bonului se copiază exact din companie, locație și casier', async () => {
    const order = await prepareCheckoutOrder(state);
    for (const overrides of [
      { companyName: 'Companie falsificată' },
      { locationName: 'Locație falsificată' },
      { locationCode: 'FALS' },
      { cashierName: 'Casier falsificat' },
      { locationId: state.locationA2.id },
      { locationId: state.locationB.id },
      { organizationId: state.b.organization.id },
      { createdByUserId: state.b.user.id },
    ]) {
      await assert.rejects(writeCheckout(state, order, overrides));
    }
  });
  await t.test('o comandă are un singur checkout, iar cheia cererii este unică local', async () => {
    const order = await prepareCheckoutOrder(state);
    const data = await checkoutData(state, order);
    await assert.rejects(
      txA(async (tx) => {
        await tx.checkout.create({ data });
        await tx.checkout.create({ data: { ...data, requestKey: randomUUID() } });
      }),
      { code: 'P2002' },
    );
    const first = await writeCheckout(state, order, { requestKey: data.requestKey });
    const other = await prepareCheckoutOrder(state);
    await assert.rejects(
      writeCheckout(state, other, {
        requestKey: first.checkout.requestKey,
      }),
      { code: 'P2002' },
    );
    await assert.rejects(
      writeCheckout(state, order, {
        mode: 'MANUAL',
        cashShiftId,
        method: 'CARD',
        receivedAmount: order.total,
        changeAmount: '0',
      }),
    );
  });
  const order = await prepareCheckoutOrder(state);
  const { checkout, payment } = await writeCheckout(state, order, {
    mode: 'MANUAL',
    cashShiftId,
    method: 'CASH',
    receivedAmount: '20.00',
    changeAmount: '9.99',
  });
  assert.ok(payment);
  await t.test('bonul, plata și liniile comenzii finalizate rămân imuabile', async () => {
    await assert.rejects(
      txA((tx) =>
        tx.checkout.update({
          where: { id: checkout.id },
          data: { companyName: 'Istoric rescris' },
        }),
      ),
    );
    await assert.rejects(txA((tx) => tx.checkout.delete({ where: { id: checkout.id } })));
    await assert.rejects(
      txA((tx) =>
        tx.payment.update({
          where: { id: payment.id },
          data: { amount: '0' },
        }),
      ),
    );
    await assert.rejects(txA((tx) => tx.payment.delete({ where: { id: payment.id } })));
    await assert.rejects(
      txA((tx) =>
        tx.payment.create({
          data: {
            ...payment,
            id: randomUUID(),
          },
        }),
      ),
      { code: 'P2002' },
    );
    await assert.rejects(
      txA((tx) =>
        tx.order.update({
          where: { id: order.id },
          data: { status: 'OPEN', version: { increment: 1 } },
        }),
      ),
    );
    await assert.rejects(txA((tx) => tx.orderItem.deleteMany({ where: { orderId: order.id } })));
    await txA((tx) =>
      tx.location.update({
        where: { id: order.locationId },
        data: {
          name: 'Locație redenumită ulterior',
          version: { increment: 1 },
        },
      }),
    );
    await txA((tx) =>
      tx.companyUser.update({
        where: { id: state.a.user.id },
        data: {
          displayName: 'Casier redenumit ulterior',
          version: { increment: 1 },
        },
      }),
    );
    const historical = await txA((tx) =>
      tx.checkout.findUniqueOrThrow({ where: { id: checkout.id } }),
    );
    assert.equal(historical.locationName, checkout.locationName);
    assert.equal(historical.cashierName, checkout.cashierName);
    assert.equal(historical.total.toFixed(2), '10.01');
  });
  await t.test(
    'RLS FORCE și privilegiile separă bonurile/plățile de alți tenant și auth/platform',
    async () => {
      const policies = await runtime.$queryRaw<OperationsRlsStatus[]>`
      SELECT c.relname AS "tableName",c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('Checkout','Payment')`;
      assert.equal(policies.length, 2);
      assert.ok(policies.every((policy) => policy.enabled && policy.forced));
      assert.deepEqual(await runtime.checkout.findMany(), []);
      assert.deepEqual(await runtime.payment.findMany(), []);
      assert.deepEqual(await txB((tx) => tx.checkout.findMany()), []);
      assert.deepEqual(await txB((tx) => tx.payment.findMany()), []);
      assert.deepEqual(
        await txB(
          (tx) => tx.$queryRaw`
      SELECT c.id FROM "Checkout" c JOIN "Payment" p ON p."checkoutId"=c.id`,
        ),
        [],
      );
      for (const client of [auth, platform]) {
        await assert.rejects(client.checkout.findMany());
        await assert.rejects(client.payment.findMany());
      }
      const other = await prepareCheckoutOrder(state);
      const data = await checkoutData(state, other);
      await assert.rejects(runtime.checkout.create({ data }));
      await assert.rejects(txB((tx) => tx.checkout.create({ data })));
      await assert.rejects(
        txB((tx) =>
          tx.payment.create({
            data: {
              ...payment,
              id: randomUUID(),
              organizationId: state.b.organization.id,
              confirmedByUserId: state.b.user.id,
            },
          }),
        ),
      );
    },
  );
}
