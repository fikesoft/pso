import { AxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import { expect, it } from 'vitest';
import { customerRegistrationUnknown } from './customer-registration';
function failure(status: number, code?: string) {
  return new AxiosError('failed', undefined, undefined, undefined, {
    status,
    data: { error: 'Respins', code },
  } as AxiosResponse);
}
it('requires exact retry after an unknown result even if a subsequent request is rejected', () => {
  expect(customerRegistrationUnknown(new Error('lost response'), false)).toBe(true);
  expect(customerRegistrationUnknown(failure(503), false)).toBe(true);
  expect(customerRegistrationUnknown(failure(403, 'REQUEST_REJECTED'), true)).toBe(true);
  expect(customerRegistrationUnknown(failure(409, 'CUSTOMER_PHONE_EXISTS'), true)).toBe(true);
});
it('only releases an initial attempt on a definite local API rejection', () => {
  expect(customerRegistrationUnknown(failure(409, 'CUSTOMER_PHONE_EXISTS'), false)).toBe(false);
  expect(customerRegistrationUnknown(failure(400, 'REQUEST_REJECTED'), false)).toBe(false);
  expect(customerRegistrationUnknown(failure(409), false)).toBe(true);
});
