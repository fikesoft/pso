import { Button, Field, Notice } from '@pos/ui';
import { addressMessages as text } from '@pos/ui/locales';
import type { DraftFieldsProps } from '../model/order-entry.types';
import { DraftAddressBook } from './draft-address-book';
export function DraftAddressFields({ model }: DraftFieldsProps) {
  const { draft } = model;
  if (draft.serviceType !== 'DELIVERY' || draft.deliveryAddress === undefined) return null;
  function patch(key: 'address' | 'instructions', value: string) {
    const next = {
      address: draft.deliveryAddress?.address ?? '',
      instructions: draft.deliveryAddress?.instructions ?? null,
      [key]: value,
    };
    model.setDraft({
      ...draft,
      deliveryAddress: next.address || next.instructions ? next : null,
      deliveryAddressEdited: true,
      addressRef: null,
      addressRefEdited: false,
      addressInvalid: false,
      addressCleared: false,
    });
  }
  return (
    <section className="form-stack" aria-label={text.title}>
      <h3>{text.title}</h3>
      <p className="scope-hint">
        {text.manual} {text.serviceHint}
      </p>
      <fieldset className="operation-fields" disabled={model.locked || !!draft.addressRef}>
        <Field
          label={text.address}
          autoComplete="off"
          maxLength={500}
          value={draft.deliveryAddress?.address ?? ''}
          onChange={(event) => patch('address', event.target.value)}
        />
        <Field
          label={text.instructions}
          autoComplete="off"
          maxLength={500}
          value={draft.deliveryAddress?.instructions ?? ''}
          onChange={(event) => patch('instructions', event.target.value)}
        />
      </fieldset>
      {draft.addressRef && (
        <>
          <p>
            {text.selected} {text.customerHint}
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={model.locked}
            onClick={model.addresses.detach}
          >
            {text.detach}
          </Button>
        </>
      )}
      {draft.addressInvalid && <Notice>{text.invalidSelection}</Notice>}
      {draft.deliveryAddress && (
        <Button
          type="button"
          variant="secondary"
          disabled={model.locked}
          onClick={model.addresses.clear}
        >
          {text.clear}
        </Button>
      )}
      <DraftAddressBook model={model} />
    </section>
  );
}
