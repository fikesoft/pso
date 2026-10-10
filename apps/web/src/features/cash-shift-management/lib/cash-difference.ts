export function cashAmountsDiffer(left: string, right: string) {
  const cents = (value: string) => {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  };
  const a = cents(left),
    b = cents(right);
  return a !== null && b !== null && a !== b;
}
