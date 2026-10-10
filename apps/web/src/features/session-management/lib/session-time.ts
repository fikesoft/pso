import { tenantLocale, defaultTimezone } from '../../../shared/config';

export function sessionTime(value: string) {
  return new Date(value).toLocaleString(tenantLocale, { timeZone: defaultTimezone });
}
