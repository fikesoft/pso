import type { CustomerDto } from '../../../packages/contracts/src/index';
import { SHOWCASE } from '../config/seed.constants';
import { STAFF_PROFILES } from '../config/staff.constants';
import { SeedHttpClient } from './http-client';
import { seedKey } from './record';
import { seedLocationOperations } from './location-operations';
import type { SeedLocationContext, SeedRecord, SeedReferences } from './seed.types';

export async function openSeedLocation(
  record: SeedRecord,
  references: SeedReferences,
  locationIndex: number,
  base: string,
) {
  const sessions: SeedHttpClient[] = [];
  const login = async (profile: string) => {
    const user = record.users.find(
      (u) => u.location === locationIndex && STAFF_PROFILES[u.profile]!.login === profile,
    )!;
    const client = new SeedHttpClient(base, record.target.origin);
    await client.login(record.companies[0]!.slug, user.secret);
    sessions.push(client);
    return client;
  };
  try {
    const operator = await login('operator');
    const cashier = await login('casier');
    const cook = await login('bucatar');
    const stock = await login('gestionar');
    const courier = await login('curier');
    const locationId = references.locationIds[locationIndex]!;
    const { shift } = await cashier.call<{ shift: { id: string } }>(
      `/cash-registers/${references.registerIds[locationIndex]}/open`,
      'POST',
      {
        locationId,
        openingAmount: '1500.00',
        requestKey: seedKey(record, `shift:${locationIndex}`),
      },
    );
    await cashier.call(`/cash-shifts/${shift.id}/movements`, 'POST', {
      locationId,
      direction: 'IN',
      version: 1,
      amount: '500.00',
      reason: 'DEMO · numerar sintetic pentru exercițiu',
      requestKey: seedKey(record, `cash-in:${locationIndex}`),
    });
    const context: SeedLocationContext = {
      record,
      references,
      locationIndex,
      operator,
      cashier,
      cook,
      stock,
      courier,
      shiftId: shift.id,
      customers: [],
    };
    await seedInventory(context);
    await seedCustomers(context);
    await seedLocationOperations(context);
    return {
      context,
      close: async () => {
        await Promise.all(sessions.map((session) => session.logout()));
      },
    };
  } catch (error) {
    await Promise.allSettled(sessions.map((session) => session.logout()));
    throw error;
  }
}

async function seedInventory(context: SeedLocationContext) {
  const { record, references, locationIndex, stock } = context;
  const locationId = references.locationIds[locationIndex]!;
  for (const item of references.inventory) {
    await stock.call('/inventory/documents', 'POST', {
      locationId,
      inventoryItemId: item.id,
      kind: 'RECEIPT',
      quantity: item.unit === 'PCS' ? '500' : '500000',
      reason: 'DEMO · stoc inițial sintetic; nu reprezintă o achiziție reală',
      requestKey: seedKey(record, `stock:${locationIndex}:${item.id}`),
    });
    await stock.call('/inventory/documents', 'POST', {
      locationId,
      inventoryItemId: item.id,
      kind: 'WASTE',
      quantity: item.unit === 'PCS' ? '1' : '100',
      reason: 'DEMO · pierdere sintetică pentru exercițiu inventar',
      requestKey: seedKey(record, `waste:${locationIndex}:${item.id}`),
    });
  }
}
async function seedCustomers(context: SeedLocationContext) {
  const { record, references, locationIndex, operator } = context;
  const locationId = references.locationIds[locationIndex]!;
  for (let i = 0; i < SHOWCASE.customersPerLocation; i++) {
    const index = locationIndex * SHOWCASE.customersPerLocation + i + 1;
    const { customer } = await operator.call<{ customer: CustomerDto }>('/customers', 'POST', {
      locationId,
      name: `Client DEMO ${String(index).padStart(3, '0')}`,
      phone: `000${String(index).padStart(6, '0')}`,
      email: `client-${index}@example.invalid`,
      requestKey: seedKey(record, `customer:${index}`),
    });
    context.customers.push(customer);
    for (const [addressIndex, label] of ['Acasă DEMO', 'Birou DEMO'].entries())
      await operator.call(`/customers/${customer.id}/addresses`, 'POST', {
        locationId,
        label,
        address: `Oraș DEMO, Strada Exemplului ${index}, clădirea ${addressIndex + 1}`,
        instructions: 'Adresă sintetică; fără apeluri sau livrări reale.',
        requestKey: seedKey(record, `address:${index}:${addressIndex}`),
      });
  }
}
