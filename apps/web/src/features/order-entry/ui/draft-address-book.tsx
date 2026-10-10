import { Button, Field, Loading, Notice } from '@pos/ui';
import { addressMessages as text } from '@pos/ui/locales';
import type { DraftFieldsProps } from '../model/order-entry.types';
export function DraftAddressBook({ model }: DraftFieldsProps) {
  const address = model.addresses;
  if (!address.canRead) return null;
  if (!address.customerId) return <p className="scope-hint">{text.profile}</p>;
  return (
    <section className="form-stack" aria-label={text.book}>
      <h3>{text.book}</h3>
      <Button
        type="button"
        variant="secondary"
        busy={address.list.loading}
        onClick={() => void address.list.refresh()}
      >
        {text.refresh}
      </Button>
      {address.list.loading && <Loading />}
      {address.list.error && <Notice>{address.list.error}</Notice>}
      {!address.list.loading && !address.list.error && !address.list.data?.addresses.length && (
        <p>{text.empty}</p>
      )}
      {address.list.data?.addresses.map((item) => (
        <article className="order-draft-item" key={item.id}>
          <strong>{item.label || text.title}</strong>
          <p>{item.address}</p>
          {item.instructions && <p>{item.instructions}</p>}
          <div className="form-footer">
            <Button
              type="button"
              disabled={model.locked || address.list.loading || !!address.list.error}
              onClick={() => address.select(item)}
            >
              {text.select}
            </Button>
            {address.canManage && (
              <Button
                type="button"
                variant="secondary"
                disabled={model.locked || address.list.loading || !!address.list.error}
                onClick={() => void address.archive(item)}
              >
                {text.archive}
              </Button>
            )}
          </div>
        </article>
      ))}
      {address.list.data?.nextCursor && (
        <Button
          type="button"
          variant="secondary"
          busy={address.list.loadingMore}
          onClick={() => void address.more()}
        >
          {text.more}
        </Button>
      )}
      {address.canManage && !model.draft.addressRef && (
        <>
          <Field
            label={text.label}
            hint={text.labelHint}
            value={address.label}
            maxLength={80}
            disabled={model.locked || address.list.loading || !!address.list.error}
            onChange={(event) => address.setLabel(event.target.value)}
          />
          <Button
            type="button"
            disabled={model.locked || !model.draft.deliveryAddress?.address.trim()}
            onClick={() => void address.create()}
          >
            {text.create}
          </Button>
        </>
      )}
    </section>
  );
}
