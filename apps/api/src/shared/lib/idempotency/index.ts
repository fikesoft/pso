import { createHash } from 'node:crypto';

/** Hash only a strict, normalized request contract with a stable property order. */
export function requestHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
