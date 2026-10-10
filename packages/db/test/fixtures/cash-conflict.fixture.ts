/** Inspect wrapped Prisma/adapter causes so an actual PostgreSQL deadlock never passes. */
export function cashConflict(error: unknown, expectedDomain: RegExp): boolean {
  const seen = new Set<object>();
  const values: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      values.push(value);
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const key of Object.getOwnPropertyNames(value)) visit(Reflect.get(value, key));
  };
  visit(error);
  if (values.some((value) => value === '40P01' || /deadlock detected/i.test(value))) return false;
  return (
    values.some((value) => value === '40001' || value === 'P2034') ||
    expectedDomain.test(String(error))
  );
}
