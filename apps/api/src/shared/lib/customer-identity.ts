import { domainHmac } from './sealed-json';
export function normalizeCustomerName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}
export function normalizeCustomerPhone(value: string) {
  return value.replace(/[+\s().-]/gu, '');
}
export function customerLookupHash(organizationId: string, field: 'name' | 'phone', value: string) {
  const normalized =
    field === 'name' ? normalizeCustomerName(value) : normalizeCustomerPhone(value);
  return normalized
    ? domainHmac(`order-customer-lookup-v1:${field}`, JSON.stringify([organizationId, normalized]))
    : null;
}
