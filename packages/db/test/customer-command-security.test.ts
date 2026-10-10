import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withTenantTransaction } from '../src';
import { createCustomerAddressFixture } from './fixtures/customer-address.fixture';
import { customerCommandData } from './fixtures/customer-command.fixture';

test('PostgreSQL: comenzi CRM izolate, proveniență imuabilă și chei retrase definitiv', async () => {
  const f = await createCustomerAddressFixture();
  try {
    const body = customerCommandData(f, f.customer.id);
    assert.equal(await f.runtime.customerCommand.count(), 0);
    await assert.rejects(f.auth.customerCommand.findMany(), /permission denied/);
    await assert.rejects(f.platform.customerCommand.findMany(), /permission denied/);
    for (const changed of [
      { actorUserId: f.b.user.id },
      { locationId: f.locationB.id },
      { customerId: f.foreign.id },
      { organizationId: f.b.organization.id },
    ])
      await assert.rejects(
        f.txA((tx) => tx.customerCommand.create({ data: { ...body, ...changed } })),
        /active scoped actor|scoped customer|row-level security/,
      );
    await assert.rejects(
      withTenantTransaction(f.runtime, { organizationId: f.a.organization.id }, (tx) =>
        tx.customerCommand.create({ data: body }),
      ),
      /active scoped actor/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.customer.update({
          where: { id: f.customer.id },
          data: { status: 'ARCHIVED', version: 2 },
        }),
      ),
      /atomic immutable command/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.customer.update({
          where: { id: f.customer.id },
          data: { creationRequestHash: 'b'.repeat(64) },
        }),
      ),
      /permission denied/,
    );
    const retired = await f.txA((tx) =>
      tx.customerCommand.create({
        data: { ...body, status: 'RETIRED', requestHash: null, expectedVersion: null },
      }),
    );
    assert.equal(retired.resultVersion, null);
    await assert.rejects(
      f.txA((tx) => tx.customerCommand.create({ data: body })),
      /Unique constraint/,
    );
    assert.equal(
      (await f.txA((tx) => tx.customer.findUniqueOrThrow({ where: { id: f.customer.id } })))
        .version,
      1,
    );
    const executed = await f.txA((tx) =>
      tx.customerCommand.create({ data: { ...body, requestKey: randomUUID() } }),
    );
    assert.equal(await f.txB((tx) => tx.customerCommand.count()), 0);
    assert.equal(await f.runtime.customerCommand.count(), 0);
    for (const command of [retired, executed]) {
      await assert.rejects(
        f.txA((tx) =>
          tx.customerCommand.update({
            where: { id: command.id },
            data: { action: 'RESTORE' },
          }),
        ),
        /permission denied/,
      );
      await assert.rejects(
        f.txA((tx) => tx.customerCommand.delete({ where: { id: command.id } })),
        /permission denied/,
      );
    }
    await assert.rejects(
      f.txA((tx) =>
        tx.customer.update({
          where: { id: f.customer.id },
          data: { status: 'ACTIVE', version: 3, lastCommandId: executed.id },
        }),
      ),
      /atomic immutable command/,
    );
    await assert.rejects(
      f.txA((tx) =>
        tx.customerCommand.create({
          data: customerCommandData(f, f.customer.id, { action: 'RESTORE', expectedVersion: 1 }),
        }),
      ),
      /version conflict/,
    );
    await assert.rejects(
      f.txA((tx) => tx.customer.delete({ where: { id: f.customer.id } })),
      /permission denied/,
    );
    assert.equal(await f.txA((tx) => tx.customerCommand.count()), 2);
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
