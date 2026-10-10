import { z } from 'zod';
import {
  DELIVERY_SIGNATURE_POINT_LIMIT,
  DELIVERY_SIGNATURE_STROKE_LIMIT,
  DELIVERY_SIGNATURE_STROKE_POINTS,
} from './config/delivery-proof.constants';
const signaturePointSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();
export const deliveryProofSchema = z
  .object({
    recipientName: z.string().trim().min(2).max(120),
    confirmed: z.literal(true),
    signature: z
      .array(z.array(signaturePointSchema).min(2).max(DELIVERY_SIGNATURE_STROKE_POINTS))
      .min(1)
      .max(DELIVERY_SIGNATURE_STROKE_LIMIT),
  })
  .strict()
  .refine(
    (value) =>
      value.signature.reduce((total, stroke) => total + stroke.length, 0) <=
      DELIVERY_SIGNATURE_POINT_LIMIT,
    { path: ['signature'], message: 'Semnătura depășește limita. Ștergeți și desenați din nou.' },
  )
  .refine(
    (value) =>
      value.signature.some((stroke) => {
        const first = stroke[0]!;
        return stroke.some((point) => Math.hypot(point.x - first.x, point.y - first.y) >= 0.02);
      }),
    { path: ['signature'], message: 'Semnătura trebuie desenată în zona indicată.' },
  );
