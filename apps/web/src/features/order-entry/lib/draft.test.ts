import type { OrderDraftState } from '../model/order-entry.types';
import { expect, it } from 'vitest';
import { draftInput } from './draft';

it('preserves retained line identity and sends modifier choices only for new lines', () => {
  const draft: OrderDraftState = {
    serviceType: 'DINE_IN',
    tableLabel: '7',
    notes: '',
    items: [
      {
        clientId: 'old',
        id: 'old',
        productId: 'coffee',
        name: 'Cafea',
        price: '10.0050',
        quantity: '2',
        courseNumber: 3,
        note: '',
        modifierGroups: [],
      },
      {
        clientId: 'new',
        productId: 'coffee',
        name: 'Cafea',
        price: '12.0050',
        quantity: '1',
        note: '',
        modifiers: [
          { bindingId: 'binding', bindingVersion: 2, groupVersion: 3, optionIds: ['large'] },
        ],
        modifierGroups: [],
      },
    ],
  };
  expect(draftInput(draft).items).toEqual([
    { id: 'old', productId: 'coffee', quantity: '2', note: '', courseNumber: 3 },
    {
      productId: 'coffee',
      quantity: '1',
      note: '',
      modifiers: [
        { bindingId: 'binding', bindingVersion: 2, groupVersion: 3, optionIds: ['large'] },
      ],
    },
  ]);
});

it('never invents or resends omitted or unchanged customer data', () => {
  const draft: OrderDraftState = { serviceType: 'TAKEAWAY', tableLabel: '', notes: '', items: [] };
  expect(draftInput(draft)).not.toHaveProperty('customer');
  expect(draftInput({ ...draft, customer: undefined, customerEdited: true })).not.toHaveProperty(
    'customer',
  );
  expect(
    draftInput({
      ...draft,
      customer: { name: 'Client', phone: '060000000' },
      customerEdited: false,
    }),
  ).not.toHaveProperty('customer');
  expect(draftInput({ ...draft, customer: null, customerEdited: false })).not.toHaveProperty(
    'customer',
  );
});
it('sends a deliberate contact replacement or explicit clear only when edited', () => {
  const draft: OrderDraftState = {
    serviceType: 'TAKEAWAY',
    tableLabel: '',
    notes: '',
    items: [],
    customerEdited: true,
  };
  expect(
    draftInput({ ...draft, customer: { name: 'Client', phone: '+373 60 000 000' } }).customer,
  ).toEqual({ name: 'Client', phone: '+373 60 000 000' });
  expect(draftInput({ ...draft, customer: null }).customer).toBeNull();
});

it('preserves hidden references and sends only explicitly selected references', () => {
  const draft: OrderDraftState = { serviceType: 'TAKEAWAY', tableLabel: '', notes: '', items: [] };
  expect(
    draftInput({ ...draft, customerRef: undefined, customerRefEdited: true }),
  ).not.toHaveProperty('customerRef');
  expect(draftInput({ ...draft, customerRef: { id: 'profile', version: 1 } })).not.toHaveProperty(
    'customerRef',
  );
  const input = draftInput({
    ...draft,
    customer: { name: 'Client', phone: '060000000' },
    customerRef: { id: 'profile', version: 1 },
    customerRefEdited: true,
  });
  expect(input.customerRef).toEqual({ id: 'profile', version: 1 });
  expect(input).not.toHaveProperty('customer');
});
it('detaches without losing the snapshot, while a deliberate manual edit replaces and unlinks', () => {
  const draft: OrderDraftState = {
    serviceType: 'TAKEAWAY',
    tableLabel: '',
    notes: '',
    items: [],
    customer: { name: 'Manual', phone: '060000000' },
    customerRef: null,
    customerRefEdited: true,
  };
  expect(draftInput(draft).customerRef).toBeNull();
  expect(draftInput(draft)).not.toHaveProperty('customer');
  const input = draftInput({ ...draft, customerEdited: true });
  expect(input.customer).toEqual(draft.customer);
  expect(input).not.toHaveProperty('customerRef');
});
