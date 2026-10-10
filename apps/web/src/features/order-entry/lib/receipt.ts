import type { Receipt } from '@pos/contracts';
import {
  checkoutMessages as text,
  operationalMessages,
  deliveryZoneMessages,
} from '@pos/ui/locales';
import { SERVICE_LABELS } from '../../../shared/config/operations.constants';
import { tenantLocale, defaultTimezone } from '../../../shared/config';
function singleLine(value: string) {
  return value
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function receiptText(receipt: Receipt) {
  const issuedAt = new Date(receipt.createdAt).toLocaleString(tenantLocale, {
    timeZone: defaultTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const lines = [
    receipt.mode === 'DEMO' ? text.demoTitle : text.manualTitle,
    text.nonFiscal,
    receipt.mode === 'DEMO' ? text.demoReceiptHint : text.manualReceiptHint,
    '',
    `${text.receiptNumber}: ${receipt.number}`,
    `${text.company}: ${singleLine(receipt.companyName)}`,
    `${text.location}: ${singleLine(receipt.locationName)} · ${singleLine(receipt.locationCode)}`,
    `${text.cashier}: ${singleLine(receipt.cashierName)}`,
    `${text.issuedAt}: ${issuedAt} (${defaultTimezone})`,
    `${operationalMessages.orderNumber}: #${receipt.orderNumber}`,
    `${SERVICE_LABELS[receipt.serviceType]}${receipt.tableLabel ? ` · ${operationalMessages.table} ${singleLine(receipt.tableLabel)}` : ''}`,
    '',
    ...receipt.items.flatMap((item) => [
      `${item.quantity} × ${singleLine(item.productName)} [${singleLine(item.productSku)}]`,
      ...item.modifierGroups.flatMap((group) =>
        group.options.length
          ? [
              `  ${singleLine(group.groupName)}: ${group.options.map((option) => singleLine(option.optionName)).join(', ')}`,
            ]
          : [],
      ),
      `${text.unitPrice}: ${item.unitPrice} ${receipt.currency} · ${item.lineTotal} ${receipt.currency}`,
      item.taxRateSnapshot === null
        ? operationalMessages.taxSnapshotUnknown
        : `${operationalMessages.taxSnapshot}: ${item.taxRateSnapshot}%`,
    ]),
    '',
    ...(receipt.serviceType === 'DELIVERY'
      ? [`${deliveryZoneMessages.fee}: ${receipt.deliveryFee} ${receipt.currency}`]
      : []),
    `${text.total}: ${receipt.total} ${receipt.currency}`,
  ];
  if (receipt.method)
    lines.push(`${text.method}: ${receipt.method === 'CASH' ? text.cash : text.card}`);
  if (receipt.receivedAmount !== null)
    lines.push(`${text.receivedValue}: ${receipt.receivedAmount} ${receipt.currency}`);
  if (receipt.changeAmount !== null)
    lines.push(`${text.change}: ${receipt.changeAmount} ${receipt.currency}`);
  lines.push('', `${text.reference}: ${receipt.id}`);
  return lines.join('\n');
}
export function downloadReceipt(receipt: Receipt) {
  const url = URL.createObjectURL(
    new Blob([receiptText(receipt)], { type: 'text/plain;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `receipt-${receipt.id}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
