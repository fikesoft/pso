import { expect, it } from 'vitest';
import type { CustomerAddressDto, Order } from '@pos/contracts';
import type { OrderDraftState } from '../model/order-entry.types';
import {
  clearLinkedDraftAddress,
  changeDraftService,
  detachDraftAddress,
  selectDraftAddress,
} from './draft-address';
import { draftInput } from './draft';
const draft: OrderDraftState = {
  serviceType: 'DELIVERY',
  tableLabel: '',
  notes: '',
  items: [],
  customerRef: { id: 'customer', version: 1 },
  deliveryAddress: null,
  addressRef: null,
};
const address = {
  id: 'address',
  version: 1,
  customerId: 'customer',
  status: 'ACTIVE',
  address: 'Strada A',
  instructions: 'Etaj 2',
  label: null,
} as CustomerAddressDto;
it('selects only active addresses of the explicitly selected delivery customer', () => {
  for (const invalid of [
    { ...address, customerId: 'other' },
    { ...address, status: 'ARCHIVED' as const },
  ])
    expect(selectDraftAddress(draft, invalid)).toBe(draft);
  expect(selectDraftAddress({ ...draft, serviceType: 'TAKEAWAY' }, address).addressRef).toBeNull();
  const selected = selectDraftAddress(draft, address);
  expect(draftInput(selected).addressRef).toEqual({ id: 'address', version: 1 });
  expect(draftInput(selected)).not.toHaveProperty('deliveryAddress');
});
it('detaches new/local selections as the visible manual snapshot and persisted links by null ref', () => {
  const selected = selectDraftAddress(draft, address);
  for (const order of [null, {} as Order]) {
    const input = draftInput(detachDraftAddress(selected, order));
    expect(input.deliveryAddress).toEqual({ address: 'Strada A', instructions: 'Etaj 2' });
    expect(input).not.toHaveProperty('addressRef');
  }
  expect(
    draftInput(detachDraftAddress({ ...selected, addressRefEdited: false }, {} as Order))
      .addressRef,
  ).toBeNull();
});
it('clears incompatible linked destinations explicitly but preserves independent manual addresses', () => {
  const selected = selectDraftAddress(draft, address);
  expect(draftInput(clearLinkedDraftAddress(selected)).deliveryAddress).toBeNull();
  const manual = detachDraftAddress(selected, null);
  expect(clearLinkedDraftAddress(manual)).toBe(manual);
  expect(draftInput(changeDraftService(manual, 'TAKEAWAY')).deliveryAddress).toBeNull();
});
it('never coerces redacted or untouched snapshots/references into mutation fields', () => {
  const redacted = { ...draft, deliveryAddress: undefined, addressRef: undefined };
  const input = draftInput(changeDraftService(redacted, 'TAKEAWAY'));
  expect(input).not.toHaveProperty('deliveryAddress');
  expect(input).not.toHaveProperty('addressRef');
  expect(draftInput({ ...draft, deliveryAddress: address })).not.toHaveProperty('deliveryAddress');
});
