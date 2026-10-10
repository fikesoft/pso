import { z } from 'zod';
import { deliveryProofSchema } from './delivery-proof.schema';
import { idSchema, versionSchema } from '../shared/validation';
export const deliveryCommandSchema = z
  .object({
    proof: deliveryProofSchema.optional(),
    version: versionSchema,
    requestKey: idSchema,
    status: z.enum([
      'WAITING_COURIER',
      'ASSIGNED',
      'PICKED_UP',
      'DELIVERING',
      'DELIVERED',
      'FAILED',
    ]),
    courierUserId: idSchema.optional(),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.proof && value.status !== 'DELIVERED')
      ctx.addIssue({
        code: 'custom',
        path: ['proof'],
        message: 'Dovada se confirmă numai la predarea livrării.',
      });
    if ((value.status === 'ASSIGNED') !== !!value.courierUserId)
      ctx.addIssue({
        code: 'custom',
        path: ['courierUserId'],
        message: 'Selectați curierul numai la atribuire.',
      });
    if (['FAILED', 'WAITING_COURIER'].includes(value.status) && !value.reason)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Motivul este obligatoriu.' });
  });
export const deliveryQuerySchema = z.object({ cursor: idSchema.optional() }).strict();
