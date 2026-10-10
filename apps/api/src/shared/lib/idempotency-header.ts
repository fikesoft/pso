import { idSchema } from '@pos/contracts';
import { assert } from './http';
export function validateIdempotencyHeader(header: unknown, requestKey: string) {
  if (header === undefined) return;
  const parsed = idSchema.safeParse(header);
  assert(
    parsed.success && parsed.data.toLowerCase() === requestKey.toLowerCase(),
    400,
    'Antetul Idempotency-Key trebuie să coincidă cu cheia cererii',
  );
}
