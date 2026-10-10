import { Badge, Button, Field, Select } from '@pos/ui';
import { modifierMessages as text, operationalMessages as common } from '@pos/ui/locales';
import type { ProductModifierBindingProps } from '../model/product-modifiers.types';

export function ProductModifierBinding({
  binding,
  model,
  editable,
  onEditRecipe,
}: ProductModifierBindingProps) {
  return (
    <section className="inventory-card form-stack" aria-label={binding.group.name}>
      <h4>{binding.group.name}</h4>
      <p>
        {binding.group.required ? text.required : text.optional} · {binding.group.minSelections}–
        {binding.group.maxSelections}
      </p>
      <Badge>{binding.status === 'ACTIVE' ? common.active : common.archived}</Badge>
      {binding.group.options.map((option) => (
        <div key={option.id} className="attendance-controls">
          <span>
            {option.name} · +{option.extraPrice} MDL
          </span>
          {onEditRecipe && binding.status === 'ACTIVE' && (
            <Button
              type="button"
              variant="secondary"
              disabled={model.busy}
              onClick={() => onEditRecipe(option)}
            >
              {text.recipeTitle}
            </Button>
          )}
        </div>
      ))}
      {editable && (
        <form
          key={binding.version}
          className="form-stack"
          onSubmit={(event) => void model.save(event, binding)}
        >
          <fieldset className="operation-fields" disabled={model.busy || model.bindings.loading}>
            <Field
              label={text.groupOrder}
              name="sortOrder"
              type="number"
              defaultValue={binding.sortOrder}
              min={0}
              max={100000}
              step={1}
              required
            />
            <Select label={text.associationStatus} name="status" defaultValue={binding.status}>
              <option value="ACTIVE">{common.active}</option>
              <option value="ARCHIVED">{common.archived}</option>
            </Select>
            <Button type="submit" busy={model.busy}>
              {text.saveAssociation}
            </Button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
