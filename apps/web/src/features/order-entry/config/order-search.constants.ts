import type { OrderSearchFields } from '../model/order-search.types';
export const EMPTY_ORDER_SEARCH: OrderSearchFields = {
  number: '',
  customerName: '',
  customerPhone: '',
  createdByUserId: '',
  status: '',
  source: '',
  createdFrom: '',
  createdTo: '',
};

export const ORDER_CONTACT_LIMITS = { name: 160, phone: 80 } as const;

export const MAX_ORDER_SEARCH_NUMBER = 2147483647;
