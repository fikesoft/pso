import { Button, Notice } from '@pos/ui';
import { addressMessages as text } from '@pos/ui/locales';
import type { DraftFieldsProps } from '../model/order-entry.types';
export function AddressRecovery({ model }: DraftFieldsProps) {
  const address = model.addresses;
  return (
    <section className="form-stack" aria-label={text.recoveryTitle}>
      {address.error && <Notice>{address.error}</Notice>}
      {address.notice && <Notice tone="info">{address.notice}</Notice>}
      {address.recovering && <Notice>{text.recovery}</Notice>}
      {address.recovering && address.canRetry && (
        <Button type="button" busy={address.busy} onClick={() => void address.retry()}>
          {text.retry}
        </Button>
      )}
      {address.recovering && address.operation === 'CREATE' && (
        <Button type="button" busy={address.busy} onClick={() => void address.resolve()}>
          {text.resolve}
        </Button>
      )}
      {address.result && address.canRead && (
        <article className="order-draft-item">
          <strong>{address.result.label || text.title}</strong>
          <p>{address.result.address}</p>
          {address.result.instructions && <p>{address.result.instructions}</p>}
          {address.result.status === 'ACTIVE' ? (
            <>
              {address.customerId !== address.result.customerId && (
                <p>{text.selectedCustomerRequired}</p>
              )}
              <Button
                type="button"
                disabled={
                  model.locked ||
                  address.list.loading ||
                  !!address.list.error ||
                  model.draft.serviceType !== 'DELIVERY' ||
                  address.customerId !== address.result.customerId
                }
                onClick={() => address.select(address.result!)}
              >
                {text.select}
              </Button>
            </>
          ) : (
            <p>{text.archived}</p>
          )}
        </article>
      )}
    </section>
  );
}
