import { billSplitMessages as text } from '@pos/ui/locales';
import type { BillItemLinesProps } from '../model/bill-service.types';
export function BillItemLines({ bill, items }: BillItemLinesProps) {
  return items?.map((item) => {
    const source = bill.sourceItems?.find((row) => row.orderItemId === item.orderItemId);
    const order = bill.sources.find((row) => row.orderId === item.orderId);
    return (
      <div key={item.orderItemId}>
        <p>
          <strong>{source?.productName}</strong>: {item.quantity} · {item.amount} MDL
        </p>
        <p>
          {text.source} #{order?.number} · {text.line} {(source?.position ?? 0) + 1}
        </p>
        {!!source?.modifiers.length && <p>{source.modifiers.join(', ')}</p>}
        {source?.note && <p>{source.note}</p>}
      </div>
    );
  });
}
