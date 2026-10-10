import { z } from 'zod';
import {
  MAX_GROUP_SELECTIONS,
  MAX_LINE_SELECTED_MODIFIERS,
  MAX_PRODUCT_MODIFIER_GROUPS,
} from '../config/modifier.constants';
import { idSchema } from './identity.schema';
import { versionSchema } from './operations.schema';

export const modifierSelectionSchema = z
  .object({
    bindingId: idSchema,
    bindingVersion: versionSchema,
    groupVersion: versionSchema,
    optionIds: z.array(idSchema).max(MAX_GROUP_SELECTIONS),
  })
  .strict()
  .refine((value) => new Set(value.optionIds).size === value.optionIds.length, {
    message: 'Opțiuni duplicate.',
    path: ['optionIds'],
  });

export const modifierSelectionsSchema = z
  .array(modifierSelectionSchema)
  .max(MAX_PRODUCT_MODIFIER_GROUPS)
  .refine((value) => new Set(value.map((item) => item.bindingId)).size === value.length, {
    message: 'Grupuri de modificatori duplicate.',
  })
  .refine(
    (value) =>
      value.reduce((count, item) => count + item.optionIds.length, 0) <=
      MAX_LINE_SELECTED_MODIFIERS,
    { message: 'Prea multe opțiuni selectate.' },
  );
