import { Button, Notice } from '@pos/ui';
import { customerMessages as text } from '@pos/ui/locales';
import type { DraftFieldsProps } from '../model/order-entry.types';
export function DraftCustomerLookup({ model }: DraftFieldsProps) {
  const customer = model.customerLookup;
  if (
    model.draft.customer === undefined ||
    (!customer.canRead && !model.draft.customerRef && !customer.uncertain)
  )
    return null;
  const found = customer.result?.customer;
  return (
    <section className="form-stack" aria-label={text.title}>
      <h3>{text.title}</h3>
      {customer.error && <Notice>{customer.error}</Notice>}
      {customer.notice && <Notice tone="success">{customer.notice}</Notice>}
      {customer.uncertain ? (
        <>
          <Notice>{text.unknown}</Notice>
          <Button type="button" busy={customer.busy} onClick={() => void customer.register()}>
            {text.retry}
          </Button>
        </>
      ) : model.draft.customerRef ? (
        <>
          <p>{text.selected}</p>
          <Button
            type="button"
            variant="secondary"
            disabled={model.locked}
            onClick={customer.detach}
          >
            {text.detach}
          </Button>
        </>
      ) : customer.canRead ? (
        <>
          <p className="scope-hint">{text.hint}</p>
          <Button
            type="button"
            variant="secondary"
            busy={customer.busy}
            disabled={model.locked || !model.draft.customer?.phone?.trim()}
            onClick={() => void customer.lookup()}
          >
            {text.lookup}
          </Button>
          {customer.result && !found && <Notice tone="info">{text.missing}</Notice>}
          {customer.result && !found && customer.canCreate && (
            <Button type="button" disabled={model.locked} onClick={() => void customer.register()}>
              {text.register}
            </Button>
          )}
          {found && (
            <article className="order-draft-item">
              <strong>{found.name || text.unnamed}</strong>
              <p>{found.phone}</p>
              <Button type="button" disabled={model.locked} onClick={customer.select}>
                {text.select}
              </Button>
            </article>
          )}
        </>
      ) : null}
    </section>
  );
}
