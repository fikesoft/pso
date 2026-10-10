import { tenantLocale, defaultTimezone } from '../../../shared/config';
export function inventoryTimestamp(value: string) {
  return `${new Date(value).toLocaleString(tenantLocale, { timeZone: defaultTimezone })} (${defaultTimezone})`;
}
