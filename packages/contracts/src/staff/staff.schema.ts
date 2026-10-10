import { z } from 'zod';
import { employeeDateSchema } from '../employee-profile';
import {
  assignmentSchema,
  idSchema,
  loginSchema,
  passwordSchema,
  staffPinSchema,
  authenticationMethodSchema,
} from '../shared';
const locationIdsSchema = z
  .array(idSchema)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, 'Locațiile nu se repetă.');
const hrFields = {
  firstName: z.string().trim().min(1).max(100).nullable().optional(),
  lastName: z.string().trim().min(1).max(100).nullable().optional(),
  phone: z.string().trim().min(3).max(40).nullable().optional(),
  email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  employeeCode: z.string().trim().min(1).max(40).nullable().optional(),
  hireDate: employeeDateSchema.nullable().optional(),
};
export const createStaffSchema = z
  .object({
    login: loginSchema,
    displayName: z.string().trim().min(2).max(100),
    password: passwordSchema.optional(),
    authenticationMethod: authenticationMethodSchema.default('PASSWORD'),
    pin: staffPinSchema.optional(),
    locationIds: locationIdsSchema.min(1),
    managedByUserId: idSchema.optional(),
    assignments: z.array(assignmentSchema).max(100).optional(),
    ...hrFields,
  })
  .strict()
  .refine((value) => value.authenticationMethod !== 'PIN' || value.password === undefined, {
    message: 'Conturile cu PIN nu primesc parolă.',
    path: ['password'],
  })
  .refine((value) => value.authenticationMethod === 'PIN' || value.pin === undefined, {
    message: 'Selectați autentificarea prin PIN pentru un cod de lucrător.',
    path: ['pin'],
  });
export const setStaffPinSchema = z.object({ pin: staffPinSchema.optional() }).strict();
export const updateStaffSchema = z
  .object({
    displayName: z.string().trim().min(2).max(100).optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
    locationIds: locationIdsSchema.min(1).optional(),
    version: z.number().int().positive(),
    ...hrFields,
  })
  .strict();
