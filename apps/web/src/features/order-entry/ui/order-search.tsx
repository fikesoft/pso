import { ORDER_CONTACT_LIMITS } from '../config/order-search.constants';
import { Button, Field, Notice, Select } from '@pos/ui';
import { ORDER_SOURCES, ORDER_STATUSES } from '@pos/contracts/orders';
import { orderSearchMessages as text } from '@pos/ui/locales';
import {
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
} from '../../../shared/config/operations.constants';
import type { OrderSearchProps } from '../model/order-search.types';
export function OrderSearch({ model }: OrderSearchProps) {
  return (
    <details>
      <summary>{text.title}</summary>
      <form
        className="form-stack"
        aria-label={text.title}
        onSubmit={(event) => {
          event.preventDefault();
          model.apply();
        }}
      >
        <p className="scope-hint">{text.matching}</p>
        {model.error && <Notice>{model.error}</Notice>}
        <div className="form-grid">
          <Field
            label={text.number}
            inputMode="numeric"
            pattern="[0-9]+"
            value={model.fields.number}
            onChange={(event) => model.patch({ number: event.target.value })}
          />
          <Field
            label={text.customerName}
            autoComplete="off"
            maxLength={ORDER_CONTACT_LIMITS.name}
            value={model.fields.customerName}
            onChange={(event) => model.patch({ customerName: event.target.value })}
          />
          <Field
            label={text.customerPhone}
            type="tel"
            autoComplete="off"
            maxLength={ORDER_CONTACT_LIMITS.phone}
            value={model.fields.customerPhone}
            onChange={(event) => model.patch({ customerPhone: event.target.value })}
          />
          <Select
            label={text.creator}
            value={model.fields.createdByUserId}
            onChange={(event) => model.patch({ createdByUserId: event.target.value })}
          >
            <option value="">{text.allCreators}</option>
            {model.creators.data?.creators.map((creator) => (
              <option key={creator.id} value={creator.id}>
                {creator.displayName}
              </option>
            ))}
          </Select>
          <Select
            label={text.status}
            value={model.fields.status}
            onChange={(event) => model.patch({ status: event.target.value })}
          >
            <option value="">{text.all}</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
          <Select
            label={text.source}
            value={model.fields.source}
            onChange={(event) => model.patch({ source: event.target.value })}
          >
            <option value="">{text.all}</option>
            <option value="UNKNOWN">{text.unknownSource}</option>
            {ORDER_SOURCES.map((source) => (
              <option key={source} value={source}>
                {ORDER_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
          <Field
            label={text.from}
            type="date"
            value={model.fields.createdFrom}
            onChange={(event) => model.patch({ createdFrom: event.target.value })}
          />
          <Field
            label={text.to}
            type="date"
            value={model.fields.createdTo}
            onChange={(event) => model.patch({ createdTo: event.target.value })}
          />
        </div>
        <p className="scope-hint">
          {text.dateHint}{' '}
          {model.orders.data?.timezone
            ? `${text.timezone}: ${model.orders.data.timezone}.`
            : text.timezonePending}
        </p>
        {model.creators.error && <Notice>{model.creators.error}</Notice>}
        <div className="form-footer">
          <Button
            type="button"
            variant="secondary"
            busy={model.creators.loading}
            onClick={() => void model.creators.refresh()}
          >
            {text.refreshCreators}
          </Button>
          {model.creators.data?.nextCursor && (
            <Button
              type="button"
              variant="secondary"
              busy={model.creators.loadingMore}
              onClick={() => void model.moreCreators()}
            >
              {text.moreCreators}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={model.reset}>
            {text.reset}
          </Button>
          <Button type="submit">{text.apply}</Button>
        </div>
      </form>
    </details>
  );
}
