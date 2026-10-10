import { createHash, randomUUID } from 'node:crypto';
import { createSecurityFixture } from './security.fixture';

export async function createOperationsFixture() {
  const state = await createSecurityFixture();
  const createCatalog = async (tenant: 'a' | 'b') => {
    const identity = state[tenant];
    const transact = tenant === 'a' ? state.txA : state.txB;
    return transact(async (tx) => {
      const category = await tx.category.create({
        data: { organizationId: identity.organization.id, name: 'Categorie sintetică' },
      });
      const product = await tx.product.create({
        data: {
          organizationId: identity.organization.id,
          categoryId: category.id,
          name: 'Produs sintetic',
          sku: 'SYNTHETIC-1',
          createdByUserId: identity.user.id,
        },
      });
      return { category, product };
    });
  };
  const catalogA = await createCatalog('a');
  const catalogB = await createCatalog('b');
  const price = await state.txA((tx) =>
    tx.locationProduct.create({
      data: {
        organizationId: state.a.organization.id,
        locationId: state.locationA.id,
        productId: catalogA.product.id,
        price: '10.0050',
      },
    }),
  );
  let orderNumber = 0;
  const createDraft = async (tenant: 'a' | 'b' = 'a', locationId?: string) => {
    const identity = state[tenant];
    const transact = tenant === 'a' ? state.txA : state.txB;
    const product = tenant === 'a' ? catalogA.product : catalogB.product;
    const location = locationId ?? (tenant === 'a' ? state.locationA.id : state.locationB.id);
    return transact(async (tx) => {
      const order = await tx.order.create({
        data: {
          organizationId: identity.organization.id,
          locationId: location,
          number: ++orderNumber,
          serviceType: 'DINE_IN',
          tableLabel: 'Masa sintetică 1',
          total: '10.01',
          clientRequestId: randomUUID(),
          creationRequestHash: createHash('sha256').update(randomUUID()).digest('hex'),
          createdByUserId: identity.user.id,
          updatedByUserId: identity.user.id,
        },
      });
      const item = await tx.orderItem.create({
        data: {
          organizationId: identity.organization.id,
          locationId: location,
          orderId: order.id,
          productId: product.id,
          position: 0,
          productName: product.name,
          productSku: product.sku,
          unitPrice: '10.0050',
          quantity: '1.000',
          lineTotal: '10.01',
          note: 'Fără ingrediente personale',
        },
      });
      return { order, item };
    });
  };
  return { ...state, catalogA, catalogB, price, createDraft };
}
