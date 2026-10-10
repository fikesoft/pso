import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseClient, withTenantTransaction } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { loadAuthorization } from '../../../apps/api/src/entities/tenant-access';
import { repeatPreview } from '../../../apps/api/src/features/orders/model/repeat-preview';

test('PostgreSQL real: preview RR read-only coerent, fără lock global și fără scurgeri pe pool', async (t) => {
  const f = await createOperationsFixture();
  const writer = createDatabaseClient(process.env.TEST_DATABASE_URL!, 1);
  try {
    const draft = await f.createDraft();
    const source = await f.txA((tx) =>
      tx.order.update({
        where: { id: draft.order.id },
        data: { status: 'CONFIRMED', version: { increment: 1 } },
      }),
    );
    const context = { organizationId: f.a.organization.id, userId: f.a.user.id };
    await t.test(
      'defaultul rămâne read committed/read-write, snapshotul refuză mutații reale',
      async () => {
        const defaults = await f.txA(
          (tx) =>
            tx.$queryRaw<
              Array<{ level: string; readOnly: string }>
            >`SELECT current_setting('transaction_isolation') AS level,current_setting('transaction_read_only') AS "readOnly"`,
        );
        assert.deepEqual(defaults, [{ level: 'read committed', readOnly: 'off' }]);
        await assert.rejects(
          withTenantTransaction(
            f.runtime,
            context,
            async (tx) => {
              const [row] = await tx.$queryRaw<
                Array<{ level: string; readOnly: string }>
              >`SELECT current_setting('transaction_isolation') AS level,current_setting('transaction_read_only') AS "readOnly"`;
              assert.deepEqual(row, { level: 'repeatable read', readOnly: 'on' });
              await tx.order.update({
                where: { id: source.id },
                data: { notes: 'forbidden-write', version: { increment: 1 } },
              });
            },
            { readOnlySnapshot: true },
          ),
          /read-only transaction/,
        );
        const stored = await f.txA((tx) =>
          tx.order.findUniqueOrThrow({ where: { id: source.id } }),
        );
        assert.equal(stored.version, source.version);
        const reset = await f.runtime.$queryRaw<
          Array<{ org: string | null; user: string | null; readOnly: string; level: string }>
        >`
        SELECT nullif(current_setting('app.organization_id',true),'') AS org,nullif(current_setting('app.user_id',true),'') AS user,
         current_setting('transaction_read_only') AS "readOnly",current_setting('transaction_isolation') AS level`;
        assert.deepEqual(reset, [
          { org: null, user: null, readOnly: 'off', level: 'read committed' },
        ]);
      },
    );
    await t.test(
      'o schimbare de catalog concurentă nu amestecă produsul/prețul/quote și nu așteaptă orglock',
      async () => {
        const before = await f.txA(async (tx) => ({
          orders: await tx.order.count(),
          events: await tx.orderRealtimeEvent.count(),
          claims: await tx.orderCreationClaim.count(),
          audit: await tx.auditEvent.count(),
        }));
        let captured!: () => void, updated!: () => void;
        const snapshotReady = new Promise<void>((resolve) => {
          captured = resolve;
        });
        const writerReady = new Promise<void>((resolve) => {
          updated = resolve;
        });
        let releaseWriter!: () => void;
        const holdWriter = new Promise<void>((resolve) => {
          releaseWriter = resolve;
        });
        const previewPromise = withTenantTransaction(
          f.runtime,
          context,
          async (tx) => {
            const authorization = await loadAuthorization(tx, f.a.organization.id);
            const currentUser = authorization.users.find((user) => user.id === f.a.user.id)!;
            const [pid] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            captured();
            await writerReady;
            const preview = await repeatPreview(
              tx,
              { ...authorization, currentUser },
              f.a.user.id,
              source,
              f.locationA.id,
            );
            assert.equal(preview.products[0]!.name, 'Produs sintetic');
            assert.equal(preview.products[0]!.price, '10.0050');
            assert.equal(preview.lines[0]!.currentUnitPrice, '10.0050');
            assert.equal(preview.estimatedTotal, '10.01');
            assert.equal(preview.checkedAt, preview.products[0]!.scheduleAvailability!.checkedAt);
            return { preview, pid: pid!.pid };
          },
          { readOnlySnapshot: true },
        );
        const writePromise = (async () => {
          await snapshotReady;
          await withTenantTransaction(writer, context, async (tx) => {
            await tx.product.update({
              where: { id: f.catalogA.product.id },
              data: { name: 'Nume nou sintetic', version: { increment: 1 } },
            });
            await tx.locationProduct.update({
              where: { id: f.price.id },
              data: { price: '20.1234', version: { increment: 1 } },
            });
          }); // The new catalog is COMMITTED before the preview fetches catalog rows.
          return withTenantTransaction(writer, context, async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${f.a.organization.id},0))`;
            const [pid] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            updated();
            await holdWriter;
            return pid!.pid;
          });
        })();
        let preview: Awaited<typeof previewPromise>;
        try {
          preview = await previewPromise;
        } finally {
          releaseWriter();
          updated();
          captured();
        }
        const writerPid = await writePromise;
        assert.notEqual(preview!.pid, writerPid);
        const current = await f.txA(async (tx) => {
          const auth = await loadAuthorization(tx, f.a.organization.id);
          return repeatPreview(
            tx,
            { ...auth, currentUser: auth.users.find((user) => user.id === f.a.user.id)! },
            f.a.user.id,
            source,
            f.locationA.id,
          );
        });
        assert.equal(current.products[0]!.name, 'Nume nou sintetic');
        assert.equal(current.lines[0]!.currentUnitPrice, '20.1234');
        assert.equal(current.estimatedTotal, '20.12');
        assert.equal(current.lines[0]!.candidate!.productId, f.catalogA.product.id);
        const after = await f.txA(async (tx) => ({
          orders: await tx.order.count(),
          events: await tx.orderRealtimeEvent.count(),
          claims: await tx.orderCreationClaim.count(),
          audit: await tx.auditEvent.count(),
        }));
        assert.deepEqual(after, before);
        assert.equal(await f.txB((tx) => tx.order.count()), 0);
        assert.equal(await f.runtime.order.count(), 0);
        const [reset] = await f.runtime.$queryRaw<
          Array<{ readOnly: string }>
        >`SELECT current_setting('transaction_read_only') AS "readOnly"`;
        assert.equal(reset!.readOnly, 'off');
      },
    );
  } finally {
    await Promise.all([
      writer.$disconnect(),
      f.runtime.$disconnect(),
      f.platform.$disconnect(),
      f.auth.$disconnect(),
    ]);
  }
});
