import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queueKitchenChange } from './kitchen-connection-io';
import { authorizeKitchenSubscription } from './kitchen-subscription';
import { liveConnection } from './connection.fixture';
import { HttpError } from '../../../shared/lib/http';
vi.mock('./kitchen-subscription', () => ({ authorizeKitchenSubscription: vi.fn() }));
vi.mock('./catalog-subscription', () => ({ authorizeCatalogSubscription: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(authorizeKitchenSubscription).mockReset();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
it('reverifică accesul și comprimă rafala într-un mesaj fără date business', async () => {
  const connection = liveConnection('kitchen');
  for (let n = 0; n < 20; n++) queueKitchenChange(connection);
  await vi.advanceTimersByTimeAsync(60);
  expect(authorizeKitchenSubscription).toHaveBeenCalledOnce();
  expect(connection.socket.send).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({ type: 'changed', topic: 'kitchen', locationId: 'location' }),
  );
});
it('o autorizare întârziată nu livrează schimbări pentru abonamentul vechi', async () => {
  const connection = liveConnection('kitchen');
  let finish!: () => void;
  vi.mocked(authorizeKitchenSubscription).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  queueKitchenChange(connection);
  await vi.advanceTimersByTimeAsync(60);
  connection.generation++;
  connection.subscription = { type: 'subscribe', topic: 'kitchen', locationId: 'other' };
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(connection.socket.send).not.toHaveBeenCalled();
});
it('revocarea închide conexiunea înainte de orice notificare', async () => {
  const connection = liveConnection('kitchen');
  vi.mocked(authorizeKitchenSubscription).mockRejectedValueOnce(new HttpError(403, 'Retras'));
  queueKitchenChange(connection);
  await vi.advanceTimersByTimeAsync(60);
  expect(connection.socket.send).not.toHaveBeenCalled();
  expect(connection.socket.close).toHaveBeenCalledWith(1008, 'Acces expirat');
});
