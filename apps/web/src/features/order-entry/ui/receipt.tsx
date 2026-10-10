import { Button } from '@pos/ui';
import { checkoutMessages as text } from '@pos/ui/locales';
import type { ReceiptProps } from '../model/checkout.types';
import { downloadReceipt, receiptText } from '../lib/receipt';
export function Receipt({ receipt, onBack }: ReceiptProps) {
  return (
    <>
      <pre className="checkout-receipt" aria-label={text.receiptNumber}>
        {receiptText(receipt)}
      </pre>
      <div className="form-footer checkout-actions">
        <Button variant="secondary" onClick={onBack}>
          {text.back}
        </Button>
        <Button variant="secondary" onClick={() => downloadReceipt(receipt)}>
          {text.download}
        </Button>
        <Button onClick={() => window.print()}>{text.print}</Button>
      </div>
    </>
  );
}
