import { describe, expect, it } from 'vitest';
import type { Receipt } from '@pos/contracts';
import { receiptText } from './receipt';
function receipt(): Receipt {
  return {
    id: 'receipt-synthetic',
    number: 'DEMO-1',
    orderId: 'order-synthetic',
    orderNumber: 1,
    mode: 'DEMO',
    method: null,
    serviceType: 'DINE_IN',
    tableLabel: '7',
    companyName: 'Companie sintetică',
    locationName: 'Locație sintetică',
    locationCode: 'TEST',
    cashierName: 'Operator sintetic',
    currency: 'MDL',
    total: '10.01',
    deliveryFee: '0.00',
    receivedAmount: null,
    changeAmount: null,
    paymentId: null,
    isFiscal: false,
    createdAt: '2026-09-18T10:00:00.000Z',
    items: [
      {
        productName: 'Cafea',
        productSku: 'CAFEA',
        quantity: '1.000',
        unitPrice: '10.0050',
        taxRateSnapshot: null,
        lineTotal: '10.01',
        modifierGroups: [],
      },
    ],
  };
}
describe('receipt text', () => {
  it('shows delivery separately from kitchen items and preserves the charged total', () => {
    const value = receipt();
    value.serviceType = 'DELIVERY';
    value.deliveryFee = '25.00';
    value.total = '35.01';
    expect(receiptText(value)).toContain('Tarif de livrare: 25.00 MDL');
    expect(receiptText(value)).toContain('Total: 35.01 MDL');
    expect(value.items).toHaveLength(1);
  });
  it('distinguishes an unknown historical tax rate from an explicitly saved zero without inventing a tax amount', () => {
    const unknown = receiptText(receipt());
    expect(unknown).toContain('Cotă istorică necunoscută');
    const zero = receipt();
    zero.items[0]!.taxRateSnapshot = '0.0000';
    expect(receiptText(zero)).toContain('Cotă salvată: 0.0000%');
    expect(receiptText(zero)).not.toContain('Cotă istorică necunoscută');
    zero.items[0]!.taxRateSnapshot = '20.1250';
    expect(receiptText(zero)).toContain('Cotă salvată: 20.1250%');
    expect(receiptText(zero)).toContain('Total: 10.01 MDL');
  });
  it('shows the local issue date, time and explicit timezone without changing the API timestamp', () => {
    const value = receipt();
    value.createdAt = '2026-09-17T22:30:00.000Z';
    const result = receiptText(value);
    expect(result).toContain('18.09.2026');
    expect(result).toContain('01:30:00 (Europe/Chisinau)');
    expect(value.createdAt).toBe('2026-09-17T22:30:00.000Z');
  });
  it('marks the fictitious receipt without claiming a payment and preserves server decimals', () => {
    const result = receiptText(receipt());
    expect(result).toContain('Bon fictiv · DEMO\nDOCUMENT NEFISCAL');
    expect(result).toContain('DEMO — fără încasare. Nu reprezintă o plată.');
    expect(result).toContain('Preț unitar: 10.0050 MDL · 10.01 MDL');
    expect(result).toContain('Total: 10.01 MDL');
    expect(result).not.toContain('Sumă primită');
    expect(result).not.toContain('Rest:');
  });
  it('includes historical modifier names as one safe text line', () => {
    const value = receipt();
    value.items[0]!.modifierGroups = [
      {
        bindingId: 'binding',
        groupId: 'group',
        groupName: 'Mărime\ntrucată',
        minSelections: 1,
        maxSelections: 1,
        groupVersion: 1,
        bindingVersion: 1,
        position: 0,
        options: [
          {
            optionId: 'option',
            optionName: 'Mare\nTOTAL FALS',
            extraPrice: '0.1234',
            optionVersion: 1,
            position: 0,
          },
        ],
      },
    ];
    const result = receiptText(value);
    expect(result).toContain('Mărime trucată: Mare TOTAL FALS');
    expect(result).not.toContain('Mare\nTOTAL FALS');
  });
  it('keeps user supplied text on its own line instead of injecting extra total rows', () => {
    const value = receipt();
    value.companyName = 'Companie\r\nTotal: 9999.00';
    value.cashierName = 'Operator\u202e ascuns';
    value.items[0]!.productName = '<script>alert(1)</script>\nTotal: 0\u2028FALS';
    value.items[0]!.productSku = 'COD\tSKU';
    const result = receiptText(value);
    expect(result.split('\n').filter((line) => line.startsWith('Total:'))).toEqual([
      'Total: 10.01 MDL',
    ]);
    expect(result).toContain('Companie: Companie Total: 9999.00');
    expect(result).toContain('<script>alert(1)</script> Total: 0 FALS [COD SKU]');
    expect(result).not.toMatch(/[\r\t\u202e\u2028]/);
  });
  it('shows received amount and change exactly as returned by the server for manual cash', () => {
    const result = receiptText({
      ...receipt(),
      mode: 'MANUAL',
      method: 'CASH',
      number: 'INC-1',
      receivedAmount: '20.00',
      changeAmount: '9.99',
      paymentId: 'payment-synthetic',
    });
    expect(result).toContain('Dovadă de încasare · nefiscală');
    expect(result).toContain('Metoda de încasare: Numerar');
    expect(result).toContain('Sumă primită: 20.00 MDL\nRest: 9.99 MDL');
    expect(result).not.toContain('DEMO');
  });
});
