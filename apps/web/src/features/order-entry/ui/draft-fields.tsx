import { AddressRecovery } from './address-recovery';
import { DraftAddressFields } from './draft-address-fields';
import { changeDraftService } from '../lib/draft-address';
import { addressMessages } from '@pos/ui/locales';
import { Notice } from '@pos/ui';
import { DraftCustomerLookup } from './draft-customer-lookup';
import { DraftCustomerFields } from './draft-customer-fields';
import { Field, Select, Button } from '@pos/ui';
import { operationalMessages as text, kitchenCourseMessages as courses } from '@pos/ui/locales';
import type { ServiceType } from '@pos/contracts';
import { SERVICE_LABELS } from '../../../shared/config/operations.constants';
import type { DraftFieldsProps } from '../model/order-entry.types';
import { ModifierSnapshot } from '../../../entities/modifier';
import { TaxSnapshot } from '../../../entities/order';
export function DraftFields({ model }: DraftFieldsProps) {
  const { draft, setDraft } = model;
  return (
    <>
      <AddressRecovery model={model} />
      {draft.addressCleared && <Notice tone="info">{addressMessages.cleared}</Notice>}
      <DraftCustomerFields model={model} />
      <DraftCustomerLookup model={model} />
      <fieldset className="operation-fields" disabled={model.locked}>
        <div className="form-grid">
          <Select
            label={text.service}
            disabled={!!draft.tableVisitId}
            value={draft.serviceType}
            onChange={(event) =>
              setDraft(changeDraftService(draft, event.target.value as ServiceType))
            }
          >
            {Object.entries(SERVICE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {draft.serviceType === 'DINE_IN' && (
            <Field
              label={text.table}
              readOnly={!!draft.tableVisitId}
              value={draft.tableLabel}
              onChange={(event) => setDraft({ ...draft, tableLabel: event.target.value })}
              required
              maxLength={40}
            />
          )}
        </div>
        <Field
          label={text.orderNotes}
          value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          maxLength={1000}
        />
        <div className="order-draft-items">
          {draft.items.map((item) => (
            <article className="order-draft-item" key={item.clientId}>
              <div className="operation-card-heading">
                <strong>{item.name}</strong>
                <span>{item.price} MDL</span>
              </div>
              <ModifierSnapshot groups={item.modifierGroups} />
              {item.id && <TaxSnapshot rate={item.taxRateSnapshot ?? null} />}
              {item.id && item.modifierGroups.some((group) => group.options.length) && (
                <p className="section-note">{text.modifierChoicesLocked}</p>
              )}
              <Select
                label={courses.select}
                value={item.courseNumber ?? 0}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    items: draft.items.map((line) =>
                      line.clientId === item.clientId
                        ? { ...line, courseNumber: Number(event.target.value) }
                        : line,
                    ),
                  })
                }
              >
                {courses.labels.map((label, course) => (
                  <option key={course} value={course}>
                    {label}
                  </option>
                ))}
              </Select>
              <div className="order-draft-controls">
                <Field
                  label={text.quantity}
                  value={item.quantity}
                  inputMode="decimal"
                  pattern="[0-9]+([.][0-9]{1,3})?"
                  required
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      items: draft.items.map((line) =>
                        line.clientId === item.clientId
                          ? { ...line, quantity: event.target.value }
                          : line,
                      ),
                    })
                  }
                />
                <Field
                  label={text.itemNotes}
                  value={item.note}
                  maxLength={500}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      items: draft.items.map((line) =>
                        line.clientId === item.clientId
                          ? { ...line, note: event.target.value }
                          : line,
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      items: draft.items.filter((line) => line.clientId !== item.clientId),
                    })
                  }
                >
                  {text.remove}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </fieldset>
      <DraftAddressFields model={model} />
    </>
  );
}
