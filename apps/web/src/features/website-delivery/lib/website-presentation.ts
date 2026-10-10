import axios from 'axios';
import { defaultTimezone, tenantLocale } from '../../../shared/config/locale.constants';
export function websiteDate(value: string) {
  return `${new Intl.DateTimeFormat(tenantLocale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: defaultTimezone,
  }).format(new Date(value))} · ${defaultTimezone}`;
}
export function isUnknownWebsiteResult(error: unknown) {
  return !axios.isAxiosError(error) || !error.response || error.response.status >= 500;
}
