import { expect, it } from 'vitest';
import type { Order } from '@pos/contracts';
import type { OrderDraftState } from '../model/order-entry.types';
import { detachDraftCustomer } from './draft-customer';
import { draftInput } from './draft';
const selected: OrderDraftState = {
  serviceType: 'TAKEAWAY',
  tableLabel: '',
  notes: '',
  items: [],
  customer: { name: 'Profil selectat', phone: '+373 60 000 000' },
  customerRef: { id: 'profile', version: 1 },
  customerRefEdited: true,
  customerEdited: false,
};
it('preserves the visible selected contact as manual data when detached before first save', () => {
  const detached = detachDraftCustomer(selected, null);
  expect(detached.customer).toEqual(selected.customer);
  expect(detached.customerRef).toBeNull();
  expect(draftInput(detached).customer).toEqual(selected.customer);
  expect(draftInput(detached)).not.toHaveProperty('customerRef');
});
it('detaches an untouched persisted link without resending its snapshot', () => {
  const order = { customer: selected.customer } as Order;
  const detached = detachDraftCustomer({ ...selected, customerRefEdited: false }, order);
  expect(detached.customer).toEqual(selected.customer);
  expect(draftInput(detached).customerRef).toBeNull();
  expect(draftInput(detached)).not.toHaveProperty('customer');
});
it('keeps a newly selected profile contact visible when detaching on an existing order', () => {
  const order = { customer: { name: 'Snapshot inițial', phone: '060111111' } } as Order;
  const detached = detachDraftCustomer(selected, order);
  expect(detached.customer).toEqual(selected.customer);
  expect(draftInput(detached).customer).toEqual(selected.customer);
  expect(draftInput(detached)).not.toHaveProperty('customerRef');
});
