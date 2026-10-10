import { z } from 'zod';

export const productTaxRateSchema = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/,
    'Cota trebuie să fie un procent cu maximum patru zecimale.',
  )
  .refine((value) => Number(value) <= 100, 'Cota nu poate depăși 100%.');
