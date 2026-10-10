import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it } from 'vitest';
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL ??= 'postgresql://test@127.0.0.1:55432/pos_test';
  process.env.AUTH_DATABASE_URL ??= process.env.DATABASE_URL;
  process.env.PLATFORM_DATABASE_URL ??= process.env.DATABASE_URL;
  process.env.CSRF_SECRET ??= 'c'.repeat(64);
  process.env.MFA_ENCRYPTION_KEY ??= 'a'.repeat(64);
});
it('dovada criptată autentifică toate referințele și amprenta nu expune date private', async () => {
  const { encryptDeliveryProof, decryptDeliveryProof, deliveryProofRequestHash } = await import(
    './delivery-proof-crypto'
  );
  const scope = {
    organizationId: randomUUID(),
    locationId: randomUUID(),
    orderId: randomUUID(),
    operationId: randomUUID(),
    assignmentId: randomUUID(),
    actorUserId: randomUUID(),
  };
  const proof = {
    recipientName: 'Destinatar sintetic',
    confirmed: true as const,
    signature: [
      [
        { x: 0.1, y: 0.2 },
        { x: 0.8, y: 0.6 },
      ],
    ],
  };
  const encrypted = encryptDeliveryProof(scope, proof);
  expect(decryptDeliveryProof(scope, encrypted)).toEqual(proof);
  expect(encrypted).not.toContain(proof.recipientName);
  expect(encryptDeliveryProof(scope, proof)).not.toBe(encrypted);
  for (const key of Object.keys(scope))
    expect(() => decryptDeliveryProof({ ...scope, [key]: randomUUID() }, encrypted)).toThrow();
  const damaged = Buffer.from(encrypted, 'base64');
  damaged[damaged.length - 1] = damaged[damaged.length - 1]! ^ 1;
  expect(() => decryptDeliveryProof(scope, damaged.toString('base64'))).toThrow();
  expect(deliveryProofRequestHash(proof)).toMatch(/^[a-f0-9]{64}$/);
  expect(deliveryProofRequestHash(proof)).toBe(deliveryProofRequestHash(structuredClone(proof)));
  expect(deliveryProofRequestHash({ ...proof, recipientName: 'Alt destinatar' })).not.toBe(
    deliveryProofRequestHash(proof),
  );
});
