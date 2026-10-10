import { describe, expect, it } from 'vitest';
import { validateOrderCreationHeader } from './order-creation-key';

describe('Idempotency-Key pentru crearea comenzii', () => {
  const key = 'abcdef00-0000-4000-8000-000000000001';
  it('păstrează compatibilitatea corpului și acceptă numai același UUID opțional', () => {
    expect(() => validateOrderCreationHeader(undefined, key)).not.toThrow();
    expect(() => validateOrderCreationHeader(key, key)).not.toThrow();
    expect(() => validateOrderCreationHeader(key.toUpperCase(), key)).not.toThrow();
  });
  it('respinge valori diferite, antete multiple și identificatori nevalizi', () => {
    for (const value of [
      null,
      '',
      'invalid',
      `${key},${key}`,
      [key],
      `${key} `,
      'abcdef00-0000-4000-8000-000000000002',
    ]) {
      expect(() => validateOrderCreationHeader(value, key)).toThrow();
      try {
        validateOrderCreationHeader(value, key);
      } catch (error) {
        expect(error).toMatchObject({ status: 400 });
      }
    }
  });
});
