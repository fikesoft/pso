import { z } from 'zod';

export const moneySchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Introduceți o sumă cu cel mult două zecimale.')
  .transform((value) => {
    const [integer, fraction = ''] = value.split('.');
    return `${integer}.${fraction.padEnd(2, '0')}`;
  });
export const positiveMoneySchema = moneySchema.refine(
  (value) => BigInt(value.replace('.', '')) > 0n,
  'Suma trebuie să fie pozitivă.',
);
