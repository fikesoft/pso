import { z } from 'zod';
import { idSchema, positiveMoneySchema, versionSchema, quantitySchema } from '../shared/validation';
export const billContextSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ORDER'), id: idSchema }).strict(),
  z.object({ kind: z.literal('VISIT'), id: idSchema }).strict(),
]);
const itemAssignmentSchema = z
  .object({
    orderItemId: idSchema,
    quantity: quantitySchema.transform((value) => {
      const [whole, fraction = ''] = value.split('.');
      return `${whole}.${fraction.padEnd(3, '0')}`;
    }),
  })
  .strict();
export const billDivisionSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('ITEMS'),
      parts: z
        .array(
          z
            .object({
              items: z.array(itemAssignmentSchema).min(1).max(10000),
            })
            .strict(),
        )
        .min(2)
        .max(50),
    })
    .strict(),
  z.object({ mode: z.literal('EQUAL'), count: z.number().int().min(2).max(50) }).strict(),
  z
    .object({ mode: z.literal('CUSTOM'), amounts: z.array(positiveMoneySchema).min(2).max(50) })
    .strict(),
]);
const previewShape = {
  locationId: idSchema,
  context: billContextSchema,
  division: billDivisionSchema,
  selection: z.enum(['ALL', 'UNPLANNED']).optional(),
};
export const billSplitPreviewSchema = z.object(previewShape).strict();
export const billSplitCreateSchema = z
  .object({
    ...previewShape,
    requestKey: idSchema,
    confirmed: z.literal(true),
    sources: z
      .array(z.object({ orderId: idSchema, version: versionSchema }).strict())
      .min(1)
      .max(100),
    visitVersion: versionSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.sources.map((source) => source.orderId)).size !== value.sources.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Comenzile trebuie să fie distincte.',
        path: ['sources'],
      });
    if ((value.context.kind === 'VISIT') !== (value.visitVersion !== undefined))
      ctx.addIssue({
        code: 'custom',
        message: 'Versiunea vizitei trebuie confirmată numai pentru o vizită.',
        path: ['visitVersion'],
      });
  });
export const billSplitReadSchema = z.object({ locationId: idSchema }).strict();

export const billSplitVoidSchema = z
  .object({
    locationId: idSchema,
    requestKey: idSchema,
    confirmed: z.literal(true),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const billPlanResolutionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('CREATE'),
      locationId: idSchema,
      requestKey: idSchema,
      context: billContextSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('VOID'),
      locationId: idSchema,
      requestKey: idSchema,
      splitId: idSchema,
    })
    .strict(),
]);

export const billSplitListSchema = z
  .object({
    locationId: idSchema,
    contextKind: z.enum(['ORDER', 'VISIT']),
    contextId: idSchema,
    cursor: idSchema.optional(),
  })
  .strict();
