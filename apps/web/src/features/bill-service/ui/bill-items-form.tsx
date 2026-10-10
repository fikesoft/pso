import { BillItemLines } from './bill-item-lines';
import { Button, Field, Notice } from '@pos/ui';
import { billSplitMessages as text } from '@pos/ui/locales';
import type { BillItemsFormProps } from '../model/bill-service.types';
import { useBillItemsForm } from '../model/use-bill-items-form';
export function BillItemsForm(props: BillItemsFormProps) {
  const model = useBillItemsForm(props);
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        model.save();
      }}
    >
      <h3>{text.items}</h3>
      <p>{text.itemsHint}</p>
      {model.error && <Notice>{model.error}</Notice>}
      <Button
        type="button"
        disabled={model.locked}
        busy={model.busy}
        onClick={() => void model.load()}
      >
        {text.loadItems}
      </Button>
      {model.source && (
        <>
          <Field
            label={text.count}
            type="number"
            min={2}
            max={50}
            value={model.count}
            disabled={model.locked}
            onChange={(event) => model.changeCount(event.target.value)}
          />
          {model.validCount &&
            model.source.sourceItems?.map((item) => (
              <fieldset
                key={item.orderItemId}
                className="operation-order-card"
                disabled={model.locked}
                data-bill-item={item.orderItemId}
              >
                <legend>{item.productName}</legend>
                <p>
                  {text.source} #
                  {model.source!.sources.find((row) => row.orderId === item.orderId)!.number} ·{' '}
                  {text.line} {item.position + 1}
                </p>
                {item.modifiers.length > 0 && <p>{item.modifiers.join(', ')}</p>}
                {item.note && <p>{item.note}</p>}
                <p>
                  {text.quantity}: {item.quantity} · {item.amount} MDL
                </p>
                {Array.from({ length: model.partCount }, (_, index) => (
                  <Field
                    key={index}
                    label={`${text.part} ${index + 1} — ${text.quantity.toLowerCase()}`}
                    inputMode="decimal"
                    value={model.quantities[item.orderItemId]?.[index] ?? ''}
                    onChange={(event) =>
                      model.changeQuantity(item.orderItemId, index, event.target.value)
                    }
                  />
                ))}
              </fieldset>
            ))}
          <Button
            type="button"
            disabled={model.locked || !model.validCount}
            onClick={() => void model.calculate()}
          >
            {text.preview}
          </Button>
        </>
      )}
      {model.preview && (
        <>
          <p>
            {text.total}: <strong>{model.preview.total} MDL</strong>
          </p>
          {model.preview.parts.map((part) => (
            <article className="operation-order-card" key={part.position}>
              <h4>
                {text.part} {part.position}: {part.amount} MDL
              </h4>
              <BillItemLines bill={model.preview!} items={part.items} />
            </article>
          ))}
          <label className="check-option">
            <input
              type="checkbox"
              disabled={model.locked}
              checked={model.confirmed}
              onChange={(event) => model.setConfirmed(event.target.checked)}
            />
            <span>{text.confirmItems}</span>
          </label>
          <Button type="submit" disabled={model.locked || !model.confirmed}>
            {text.save}
          </Button>
        </>
      )}
      <Button type="button" variant="secondary" disabled={model.locked} onClick={props.onAmounts}>
        {text.byAmounts}
      </Button>
      <Button type="button" variant="secondary" disabled={model.locked} onClick={props.onClose}>
        {text.cancel}
      </Button>
    </form>
  );
}
