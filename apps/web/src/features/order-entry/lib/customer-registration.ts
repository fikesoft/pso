import axios from 'axios';
export function customerRegistrationUnknown(error: unknown, wasUncertain: boolean) {
  if (wasUncertain) return true;
  const response = axios.isAxiosError(error) ? error.response : undefined;
  const rejected =
    response &&
    response.status >= 400 &&
    response.status < 500 &&
    typeof response.data?.error === 'string' &&
    [
      'REQUEST_REJECTED',
      'CUSTOMER_PHONE_EXISTS',
      'NOT_FOUND',
      'BODY_TOO_LARGE',
      'INVALID_JSON',
    ].includes(response.data?.code);
  return !rejected;
}
