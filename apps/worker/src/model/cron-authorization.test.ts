import { expect, it } from 'vitest';
import { authorizedCron } from './cron-authorization';

it('refuză cronul fără secret lung, token incorect sau cookie tenant', () => {
  const secret = 'synthetic-private-secret-with-32-characters';
  expect(authorizedCron(`Bearer ${secret}`, secret)).toBe(true);
  expect(authorizedCron('Bearer different', secret)).toBe(false);
  expect(authorizedCron(undefined, secret)).toBe(false);
  expect(authorizedCron(`Bearer ${secret}`, undefined)).toBe(false);
  expect(authorizedCron('Bearer short', 'short')).toBe(false);
  expect(authorizedCron(`pos_tenant=${secret}`, secret)).toBe(false);
});
