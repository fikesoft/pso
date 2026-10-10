import { EventEmitter } from 'node:events';
import pg from 'pg';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listenForDatabaseNotifications } from './notifications';

vi.mock('pg', () => ({ default: { Client: vi.fn() } }));
function fakeClient() {
  return Object.assign(new EventEmitter(), {
    connect: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(pg.Client).mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

it('reconnects once after a broken listener and ignores its stale notifications', async () => {
  const first = fakeClient();
  const second = fakeClient();
  vi.mocked(pg.Client)
    .mockImplementationOnce(function () {
      return first as unknown as pg.Client;
    })
    .mockImplementationOnce(function () {
      return second as unknown as pg.Client;
    });
  const onReady = vi.fn();
  const onDisconnect = vi.fn();
  const onMessage = vi.fn();
  const close = listenForDatabaseNotifications({
    connectionString: 'postgresql://local-test',
    channel: 'test_events',
    onReady,
    onDisconnect,
    onMessage,
  });
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(first.query).toHaveBeenCalledWith('LISTEN "test_events"');
    expect(onReady).toHaveBeenCalledTimes(1);
    first.emit('notification', { channel: 'other', payload: 'ignored' });
    first.emit('notification', { channel: 'test_events', payload: 'committed' });
    expect(onMessage.mock.calls).toEqual([['committed']]);
    first.emit('error', new Error('Synthetic disconnect'));
    first.emit('end');
    first.emit('notification', { channel: 'test_events', payload: 'stale' });
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onReady).toHaveBeenCalledTimes(2);
    second.emit('notification', { channel: 'test_events', payload: 'reconnected' });
    expect(onMessage.mock.calls).toEqual([['committed'], ['reconnected']]);
  } finally {
    await close();
  }
  second.emit('error', new Error('Closed'));
  await vi.advanceTimersByTimeAsync(5000);
  expect(pg.Client).toHaveBeenCalledTimes(2);
  expect(second.end).toHaveBeenCalledTimes(1);
});

it('stops retrying after startup failure and rejects invalid channel identifiers', async () => {
  const client = fakeClient();
  client.connect.mockRejectedValue(new Error('Synthetic connection failure'));
  vi.mocked(pg.Client).mockImplementation(function () {
    return client as unknown as pg.Client;
  });
  const options = {
    connectionString: 'postgresql://local-test',
    channel: 'test_events',
    onReady: vi.fn(),
    onDisconnect: vi.fn(),
    onMessage: vi.fn(),
  };
  expect(() => listenForDatabaseNotifications({ ...options, channel: 'x; SELECT 1' })).toThrow();
  const close = listenForDatabaseNotifications(options);
  await vi.advanceTimersByTimeAsync(0);
  expect(options.onReady).not.toHaveBeenCalled();
  expect(options.onDisconnect).toHaveBeenCalledTimes(1);
  await close();
  await vi.advanceTimersByTimeAsync(5000);
  expect(pg.Client).toHaveBeenCalledTimes(1);
});
