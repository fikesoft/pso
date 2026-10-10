import { ORDER_CONTACT_LIMITS } from '../config/order-search.constants';
import { Field } from '@pos/ui';
import { orderSearchMessages as text } from '@pos/ui/locales';
import type { DraftFieldsProps } from '../model/order-entry.types';
export function DraftCustomerFields({ model }: DraftFieldsProps) {
  const { draft } = model;
  if (draft.customer === undefined) return null;
  function patch(key: 'name' | 'phone', value: string) {
    const customer = {
      name: draft.customer?.name ?? null,
      phone: draft.customer?.phone ?? null,
      [key]: value || null,
    };
    model.setDraft({
      ...draft,
      customer: customer.name || customer.phone ? customer : null,
      customerEdited: true,
      customerRef: null,
      customerRefEdited: false,
    });
  }
  return (
    <fieldset className="operation-fields" disabled={model.locked || !!draft.customerRef}>
      <legend>{text.customer}</legend>
      <p className="scope-hint">{text.contactHint}</p>
      <div className="form-grid">
        <Field
          label={text.customerName}
          autoComplete="off"
          maxLength={ORDER_CONTACT_LIMITS.name}
          value={draft.customer?.name ?? ''}
          onChange={(event) => patch('name', event.target.value)}
        />
        <Field
          label={text.customerPhone}
          type="tel"
          autoComplete="off"
          maxLength={ORDER_CONTACT_LIMITS.phone}
          value={draft.customer?.phone ?? ''}
          onChange={(event) => patch('phone', event.target.value)}
        />
      </div>
    </fieldset>
  );
}
