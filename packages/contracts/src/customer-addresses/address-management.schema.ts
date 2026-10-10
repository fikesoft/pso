import { z } from 'zod';
import { idSchema } from '../shared/model/identity.schema';
import {
  ADDRESS_MANAGEMENT_ACTIONS,
  ADDRESS_MANAGEMENT_FILTERS,
} from './config/address-management.constants';

const versionSchema = z.number().int().min(1).max(2147483647);
const mutableVersionSchema = versionSchema.max(2147483646);
export const addressManagementProfileSchema = z
  .object({
    label: z
      .string()
      .trim()
      .max(80)
      .nullable()
      .transform((value) => value || null),
    address: z.string().trim().min(1).max(500),
    instructions: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .transform((value) => value || null),
  })
  .strict();
const command = z.object({ locationId: idSchema, requestKey: idSchema });
export const addressManagementCommandSchema = z.discriminatedUnion('action', [
  command
    .extend({
      action: z.literal('UPDATE'),
      version: mutableVersionSchema,
      profile: addressManagementProfileSchema,
    })
    .strict(),
  command.extend({ action: z.literal('ARCHIVE'), version: mutableVersionSchema }).strict(),
  command
    .extend({
      action: z.literal('SET_DEFAULT'),
      version: versionSchema,
      preferenceVersion: mutableVersionSchema,
    })
    .strict(),
  command
    .extend({
      action: z.literal('CLEAR_DEFAULT'),
      version: versionSchema,
      preferenceVersion: mutableVersionSchema,
    })
    .strict(),
]);
export const addressManagementResolutionSchema = command
  .extend({ action: z.enum(ADDRESS_MANAGEMENT_ACTIONS) })
  .strict();
export const addressManagementIdentitySchema = addressManagementResolutionSchema
  .extend({ addressId: idSchema })
  .strict();
export const addressManagementPreferenceSchema = z
  .object({
    customerId: idSchema,
    version: versionSchema,
    defaultAddressId: idSchema.nullable(),
  })
  .strict();
export const addressManagementDtoSchema = addressManagementProfileSchema
  .extend({
    id: idSchema,
    customerId: idSchema,
    version: versionSchema,
    status: z.enum(['ACTIVE', 'ARCHIVED']),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const addressManagementQuerySchema = z
  .object({
    locationId: idSchema,
    status: z.enum(ADDRESS_MANAGEMENT_FILTERS).default('ACTIVE'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export const addressManagementListResponseSchema = z
  .object({
    addresses: z.array(addressManagementDtoSchema),
    preference: addressManagementPreferenceSchema,
    nextCursor: z.string().min(1).max(2048).nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.addresses.every((address) => address.customerId === value.preference.customerId),
    {
      message: 'Adresele nu aparțin aceluiași client.',
    },
  );
export const addressManagementResultSchema = z
  .object({
    customerId: idSchema,
    addressId: idSchema,
    requestKey: idSchema,
    action: z.enum(ADDRESS_MANAGEMENT_ACTIONS),
    expectedVersion: versionSchema,
    version: versionSchema,
    status: z.enum(['ACTIVE', 'ARCHIVED']),
    expectedPreferenceVersion: versionSchema,
    preferenceVersion: versionSchema,
    defaultAddressId: idSchema.nullable(),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    const contentChange = value.action === 'UPDATE' || value.action === 'ARCHIVE';
    if (value.version !== value.expectedVersion + (contentChange ? 1 : 0))
      context.addIssue({
        code: 'custom',
        path: ['version'],
        message: 'Versiunea adresei nu corespunde operației.',
      });
    if (value.status !== (value.action === 'ARCHIVE' ? 'ARCHIVED' : 'ACTIVE'))
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Starea adresei nu corespunde operației.',
      });
    const difference = value.preferenceVersion - value.expectedPreferenceVersion;
    const validPreference =
      value.action === 'UPDATE'
        ? difference === 0
        : value.action === 'ARCHIVE'
          ? (difference === 0 || (difference === 1 && value.defaultAddressId === null)) &&
            value.defaultAddressId !== value.addressId
          : difference === 1 &&
            value.defaultAddressId === (value.action === 'SET_DEFAULT' ? value.addressId : null);
    if (!validPreference)
      context.addIssue({
        code: 'custom',
        path: ['preferenceVersion'],
        message: 'Preferința nu corespunde operației.',
      });
  });
export const addressManagementCommandResponseSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        status: z.literal('SUCCEEDED'),
        command: addressManagementIdentitySchema,
        result: addressManagementResultSchema,
        address: addressManagementDtoSchema,
        preference: addressManagementPreferenceSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal('RETIRED'),
        command: addressManagementIdentitySchema,
        result: z.null(),
        address: addressManagementDtoSchema,
        preference: addressManagementPreferenceSchema,
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (
      value.address.id !== value.command.addressId ||
      value.address.customerId !== value.preference.customerId
    )
      context.addIssue({
        code: 'custom',
        message: 'Identitatea adresei nu corespunde răspunsului.',
      });
    if (value.status === 'RETIRED') return;
    const result = value.result;
    if (
      result.customerId !== value.address.customerId ||
      result.addressId !== value.address.id ||
      result.requestKey !== value.command.requestKey ||
      result.action !== value.command.action ||
      value.address.version < result.version ||
      value.preference.version < result.preferenceVersion ||
      (value.address.version === result.version && value.address.status !== result.status) ||
      (value.preference.version === result.preferenceVersion &&
        value.preference.defaultAddressId !== result.defaultAddressId)
    )
      context.addIssue({
        code: 'custom',
        message: 'Rezultatul istoric și starea curentă nu sunt compatibile.',
      });
  });
