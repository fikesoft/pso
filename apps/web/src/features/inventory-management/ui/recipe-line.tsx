import { Button, Field, Select } from '@pos/ui';
import { inventoryMessages as text } from '@pos/ui/locales';
import type { RecipePurpose, ServiceType } from '@pos/contracts';
import { SERVICE_LABELS } from '../../../shared/config/operations.constants';
import {
  INVENTORY_UNIT_SYMBOLS,
  PURPOSES_BY_KIND,
  PURPOSE_LABELS,
  RECIPE_QUANTITY_PATTERN,
} from '../config/inventory.constants';
import type { RecipeLineProps } from '../model/inventory.types';
export function RecipeLine({ line, index, editor, items }: RecipeLineProps) {
  const item = items.find((value) => value.id === line.inventoryItemId);
  const unit = item?.unit ?? line.unit;
  const purposes = item
    ? PURPOSES_BY_KIND[item.kind]
    : (Object.keys(PURPOSE_LABELS) as RecipePurpose[]);
  return (
    <fieldset className="inventory-component">
      <legend>
        {text.component} {index + 1}
      </legend>
      <Select
        label={text.item}
        value={line.inventoryItemId}
        required
        onChange={(event) => editor.changeItem(line.clientId, event.target.value)}
      >
        <option value="">{text.item}</option>
        {!item && line.inventoryItemId && (
          <option value={line.inventoryItemId}>{line.itemName || line.inventoryItemId}</option>
        )}
        {items.map((value) => (
          <option key={value.id} value={value.id} disabled={value.status !== 'ACTIVE'}>
            {value.name} · {INVENTORY_UNIT_SYMBOLS[value.unit]}
            {value.status !== 'ACTIVE' ? ` · ${text.archive}` : ''}
          </option>
        ))}
      </Select>
      <Select
        label={text.purpose}
        value={line.purpose}
        onChange={(event) =>
          editor.patchLine(line.clientId, { purpose: event.target.value as RecipePurpose })
        }
      >
        {purposes.map((value) => (
          <option key={value} value={value}>
            {PURPOSE_LABELS[value]}
          </option>
        ))}
      </Select>
      <Field
        label={text.perProduct}
        value={line.quantityPerUnit}
        onChange={(event) =>
          editor.patchLine(line.clientId, { quantityPerUnit: event.target.value.replace(',', '.') })
        }
        required
        inputMode="decimal"
        pattern={RECIPE_QUANTITY_PATTERN}
        hint={`${text.perProductHint}${unit ? ` ${INVENTORY_UNIT_SYMBOLS[unit]}` : ''}`}
      />
      <div>
        <p className="scope-hint">{text.serviceTypes}</p>
        <div className="inventory-service-options">
          {Object.entries(SERVICE_LABELS).map(([value, label]) => (
            <label className="check-option" key={value}>
              <input
                type="checkbox"
                checked={line.serviceTypes.includes(value as ServiceType)}
                onChange={(event) =>
                  editor.patchLine(line.clientId, {
                    serviceTypes: event.target.checked
                      ? [...line.serviceTypes, value as ServiceType]
                      : line.serviceTypes.filter((service) => service !== value),
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <Button type="button" variant="danger" onClick={() => editor.removeLine(line.clientId)}>
        {text.removeComponent}
      </Button>
    </fieldset>
  );
}
