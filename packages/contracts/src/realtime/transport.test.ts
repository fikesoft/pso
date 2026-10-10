import { expect, it } from 'vitest';
import { realtimeUrl } from './transport';

it('uses the cookie host and a dedicated endpoint with secure transport for HTTPS', () => {
  expect(realtimeUrl('http://127.0.0.1:3000', undefined, true)).toBe(
    'ws://127.0.0.1:4000/api/tenant/realtime',
  );
  expect(realtimeUrl('https://pos.example', undefined, false)).toBe(
    'wss://pos.example/api/tenant/realtime',
  );
  for (const url of [
    'ws://pos.example/api/tenant/realtime',
    'wss://other.example/api/tenant/realtime',
    'https://pos.example/api/tenant/realtime',
    'wss://pos.example/other',
    'wss://pos.example/api/tenant/realtime?token=abc',
    'wss://user:password@pos.example/api/tenant/realtime',
  ])
    expect(() => realtimeUrl('https://pos.example', url, false)).toThrow();
});
