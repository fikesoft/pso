import type { Limits } from '../model/authorization.types.js';

import { DECIMAL } from '../config/decimal.constants.js';
/** Decimal strings become integer hundredths, never IEEE-754 numbers. */
export function decimalUnits(value: string): bigint | null {
  if (typeof value !== 'string' || !DECIMAL.test(value)) return null;
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function decimalAtMost(value: string, maximum: string): boolean {
  const left = decimalUnits(value);
  const right = decimalUnits(maximum);
  return left !== null && right !== null && left <= right;
}
export function validLimits(limits: Limits = {}): boolean {
  return (
    Object.keys(limits).every((key) => key === 'maxAmount' || key === 'maxPercent') &&
    (limits.maxAmount === undefined || decimalUnits(limits.maxAmount) !== null) &&
    (limits.maxPercent === undefined || decimalAtMost(limits.maxPercent, '100'))
  );
}
/** Omitting a bound asks for unlimited authority and cannot fit a finite ceiling. */
export function limitsWithin(requested: Limits = {}, ceiling: Limits = {}): boolean {
  if (!validLimits(requested) || !validLimits(ceiling)) return false;
  return (['maxAmount', 'maxPercent'] as const).every(
    (key) =>
      ceiling[key] === undefined ||
      (requested[key] !== undefined && decimalAtMost(requested[key], ceiling[key])),
  );
}
