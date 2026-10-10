import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { deliveryCommandSchema, deliveryProofSchema } from '../src/delivery';
it('dovada cere destinatar, confirmare explicită, desen valid și dimensiuni limitate', () => {
  const proof = {
    recipientName: 'Destinatar sintetic',
    confirmed: true,
    signature: [
      [
        { x: 0.1, y: 0.2 },
        { x: 0.7, y: 0.8 },
      ],
    ],
  };
  expect(deliveryProofSchema.parse(proof)).toEqual(proof);
  for (const patch of [
    { recipientName: ' ' },
    { confirmed: false },
    { signature: [] },
    {
      signature: [
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      ],
    },
    {
      signature: [
        [
          { x: -1, y: 0 },
          { x: 1, y: 0 },
        ],
      ],
    },
    {
      signature: Array.from({ length: 3 }, () =>
        Array.from({ length: 200 }, () => ({ x: 0.1, y: 0.2 })),
      ),
    },
    { signature: Array.from({ length: 21 }, () => proof.signature[0]) },
    { confirmedAt: new Date().toISOString() },
    { actorUserId: randomUUID() },
  ])
    expect(deliveryProofSchema.safeParse({ ...proof, ...patch }).success).toBe(false);
  const body = { version: 2, requestKey: randomUUID(), status: 'DELIVERED', proof };
  expect(deliveryCommandSchema.safeParse(body).success).toBe(true);
  expect(deliveryCommandSchema.safeParse({ ...body, status: 'PICKED_UP' }).success).toBe(false);
});
