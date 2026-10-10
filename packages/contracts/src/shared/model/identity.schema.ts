import { z } from 'zod';
import { PIN_PATTERN } from '../config/pin.constants';
export const idSchema = z.uuid();
export const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Folosiți litere latine, cifre, punct, cratimă sau underscore.');
export const companySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const passwordSchema = z
  .string()
  .min(12, 'Parola trebuie să conțină cel puțin 12 caractere.')
  .max(128);
export const staffPinSchema = z
  .string()
  .trim()
  .regex(
    new RegExp(`^${PIN_PATTERN}$`),
    'Codul PIN trebuie să conțină între 9 și 32 de litere sau cifre.',
  )
  .toUpperCase();
export const authenticationMethodSchema = z.enum(['PASSWORD', 'PIN']);
