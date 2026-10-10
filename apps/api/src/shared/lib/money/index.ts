import {
  DECIMAL_PATTERN,
  MONEY_SCALE,
  PRICE_SCALE,
  QUANTITY_SCALE,
} from './config/money.constants';

export function decimalUnits(value: string, scale: number): bigint {
  const match = DECIMAL_PATTERN.exec(value);
  if (!match || (match[2]?.length ?? 0) > scale) throw new Error('Valoare zecimală invalidă');
  return BigInt(match[1]! + (match[2] ?? '').padEnd(scale, '0'));
}

export function decimalString(units: bigint, scale: number): string {
  if (units < 0n) throw new Error('Suma nu poate fi negativă');
  const digits = units.toString().padStart(scale + 1, '0');
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

/** Round each exact price × quantity once, half up, to MDL cents. */
export function lineAmount(price: string, quantity: string): string {
  const product = decimalUnits(price, PRICE_SCALE) * decimalUnits(quantity, QUANTITY_SCALE);
  const divisor = 10n ** BigInt(PRICE_SCALE + QUANTITY_SCALE - MONEY_SCALE);
  return decimalString((product + divisor / 2n) / divisor, MONEY_SCALE);
}

export function totalAmount(lines: readonly string[]): string {
  return decimalString(
    lines.reduce((total, line) => total + decimalUnits(line, MONEY_SCALE), 0n),
    MONEY_SCALE,
  );
}
