import { orderCustomerSchema } from './order-customer.schema';
import { z } from 'zod';
import { kitchenCourseSchema } from '../kitchen/course.schema';
import {
  MANUAL_ORDER_SOURCES,
  ORDER_SOURCES,
  ORDER_STATUSES,
  SERVICE_TYPES,
} from './config/order.constants';
import {
  idSchema,
  customerRefSchema,
  deliveryAddressSchema,
  addressRefSchema,
  modifierSelectionsSchema,
  operationsQuerySchema,
  quantitySchema,
  versionSchema,
} from '../shared';

export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const serviceTypeSchema = z.enum(SERVICE_TYPES);
export const orderSourceSchema = z.enum(ORDER_SOURCES);
export const manualOrderSourceSchema = z.enum(MANUAL_ORDER_SOURCES);
export const orderQuerySchema = operationsQuerySchema
  .extend({
    status: orderStatusSchema.optional(),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export const orderItemInputSchema = z
  .object({
    productId: idSchema,
    courseNumber: kitchenCourseSchema.optional(),
    sourceUpsellOfferId: idSchema.optional(),
    quantity: quantitySchema,
    note: z.string().trim().max(500).optional(),
    modifiers: modifierSelectionsSchema.optional(),
  })
  .strict();
export const editableOrderSchema = z.object({
  customer: orderCustomerSchema.nullable().optional(),
  customerRef: customerRefSchema.nullable().optional(),
  deliveryAddress: deliveryAddressSchema.nullable().optional(),
  addressRef: addressRefSchema.nullable().optional(),
  serviceType: serviceTypeSchema,
  tableLabel: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export const createOrderSchema = editableOrderSchema
  .extend({
    source: manualOrderSourceSchema.default('POS'),
    tableVisitId: idSchema.optional(),
    locationId: idSchema,
    items: z.array(orderItemInputSchema).min(1).max(50),
    requestKey: idSchema,
  })
  .strict()
  .refine((value) => !value.customerRef || value.customer === undefined, {
    message: 'Selectați un profil sau introduceți contactul manual.',
    path: ['customerRef'],
  })
  .refine((value) => !value.addressRef || value.deliveryAddress === undefined, {
    message: 'Selectați o adresă salvată sau introduceți adresa manual.',
    path: ['addressRef'],
  })
  .refine(
    (value) => value.serviceType === 'DELIVERY' || (!value.deliveryAddress && !value.addressRef),
    {
      message: 'Adresa este disponibilă numai pentru livrare.',
      path: ['deliveryAddress'],
    },
  )
  .refine(
    (value) => value.serviceType !== 'DINE_IN' || !!value.tableLabel || !!value.tableVisitId,
    {
      message: 'Numărul mesei este obligatoriu.',
      path: ['tableLabel'],
    },
  )
  .refine(
    (value) =>
      !value.tableVisitId || (value.serviceType === 'DINE_IN' && value.tableLabel === undefined),
    {
      message: 'Vizita stabilește masa și este disponibilă numai pentru consum în local.',
      path: ['tableVisitId'],
    },
  );
export const updateOrderSchema = editableOrderSchema
  .extend({
    version: versionSchema,
    items: z
      .array(orderItemInputSchema.extend({ id: idSchema.optional() }))
      .min(1)
      .max(50),
  })
  .strict()
  .refine((value) => !value.customerRef || value.customer === undefined, {
    message: 'Selectați un profil sau introduceți contactul manual.',
    path: ['customerRef'],
  })
  .refine((value) => !value.addressRef || value.deliveryAddress === undefined, {
    message: 'Selectați o adresă salvată sau introduceți adresa manual.',
    path: ['addressRef'],
  })
  .refine(
    (value) => value.serviceType === 'DELIVERY' || (!value.deliveryAddress && !value.addressRef),
    {
      message: 'Adresa este disponibilă numai pentru livrare.',
      path: ['deliveryAddress'],
    },
  )
  .refine((value) => value.serviceType !== 'DINE_IN' || !!value.tableLabel, {
    message: 'Numărul mesei este obligatoriu.',
    path: ['tableLabel'],
  })
  .refine(
    (value) => {
      const ids = value.items.flatMap((item) => (item.id ? [item.id] : []));
      return new Set(ids).size === ids.length;
    },
    { message: 'Liniile comenzii trebuie să fie distincte.', path: ['items'] },
  )
  .refine(
    (value) =>
      value.items.every(
        (item) =>
          !item.id || (item.modifiers === undefined && item.sourceUpsellOfferId === undefined),
      ),
    {
      message: 'Schimbați modificatorii printr-o linie nouă.',
      path: ['items'],
    },
  );
export const sendOrderSchema = z.object({ version: versionSchema, requestKey: idSchema }).strict();
export const confirmOrderSchema = sendOrderSchema;
export const completeOrderSchema = sendOrderSchema;
export const cancelOrderSchema = z
  .object({
    version: versionSchema,
    requestKey: idSchema.optional(),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
