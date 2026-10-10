import { Field, Select } from '@pos/ui';
import { inventoryMessages as text } from '@pos/ui/locales';
import type { InventoryKind, InventoryUnit, InventoryStatus } from '@pos/contracts';
import { INVENTORY_KIND_LABELS, INVENTORY_UNIT_LABELS } from '../config/inventory.constants';
import type { ItemFieldsProps } from '../model/inventory.types';
export function ItemFields({ model }: ItemFieldsProps) {
  return (
    <fieldset className="operation-fields" disabled={model.busy || model.stale}>
      <Field
        label={text.itemName}
        value={model.name}
        onChange={(event) => model.setName(event.target.value)}
        required
        maxLength={150}
      />
      <Field
        label={text.sku}
        value={model.sku}
        onChange={(event) => model.setSku(event.target.value)}
        required
        maxLength={60}
        disabled={!!model.item}
      />
      <Select
        label={text.kind}
        value={model.kind}
        onChange={(event) => model.setKind(event.target.value as InventoryKind)}
        disabled={!!model.item}
      >
        {Object.entries(INVENTORY_KIND_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Select
        label={text.unit}
        value={model.unit}
        onChange={(event) => model.setUnit(event.target.value as InventoryUnit)}
        disabled={!!model.item}
      >
        {Object.entries(INVENTORY_UNIT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      {model.item && (
        <Select
          label={text.status}
          value={model.status}
          onChange={(event) => model.setStatus(event.target.value as InventoryStatus)}
        >
          <option value="ACTIVE">{text.active}</option>
          <option value="ARCHIVED">{text.archive}</option>
        </Select>
      )}
    </fieldset>
  );
}
