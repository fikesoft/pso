/** Normalize ASCII letters without turning unsupported Unicode into a valid credential. */
export function normalizePinInput(value: string): string {
  return value.replace(/[a-z]/g, (letter) => letter.toUpperCase());
}
