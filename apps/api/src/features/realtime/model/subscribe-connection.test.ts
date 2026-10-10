import { expect, it, vi } from 'vitest';
import { subscribeConnection } from './subscribe-connection';
import { authorizeLiveSubscription } from './subscription-authorization';
import { liveConnection } from './connection.fixture';

vi.mock('./subscription-authorization', () => ({ authorizeLiveSubscription: vi.fn() }));
vi.mock('./order-subscription', () => ({
  authorizeOrderSubscription: vi.fn(),
  readOrderRealtimeMessage: vi.fn(),
}));
vi.mock('./catalog-subscription', () => ({ authorizeCatalogSubscription: vi.fn() }));
vi.mock('./kitchen-subscription', () => ({ authorizeKitchenSubscription: vi.fn() }));
it('ACK-ul orders forțează recitire și elimină coada vechiului abonament', async () => {
  const connection = liveConnection();
  connection.pendingOrders.set('old', {
    eventId: 'old',
    organizationId: 'org',
    locationId: 'location',
  });
  let finish!: () => void;
  vi.mocked(authorizeLiveSubscription).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const locationId = 'abcdef00-0000-4000-8000-000000000001';
  const subscribing = subscribeConnection(
    connection,
    Buffer.from(JSON.stringify({ type: 'subscribe', topic: 'orders', locationId })),
    false,
  );
  expect(connection.socket.send).not.toHaveBeenCalled();
  finish();
  await subscribing;
  expect(connection.pendingOrders.size).toBe(0);
  expect(connection.generation).toBe(2);
  expect(connection.socket.send).toHaveBeenNthCalledWith(
    1,
    JSON.stringify({ type: 'subscribed', locationId, topic: 'orders' }),
  );
  expect(connection.socket.send).toHaveBeenNthCalledWith(
    2,
    JSON.stringify({ type: 'resync', topic: 'orders', locationId }),
  );
});
