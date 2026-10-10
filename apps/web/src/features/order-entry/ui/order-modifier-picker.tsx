import { Button } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import { MAX_LINE_SELECTED_MODIFIERS } from '@pos/contracts/modifiers';
import { previewProductModifiers } from '../../../entities/modifier';
import type { OrderModifierPickerProps } from '../model/order-entry.types';

export function OrderModifierPicker({
  product,
  choices,
  disabled,
  available,
  onToggle,
  onCancel,
  onConfirm,
}: OrderModifierPickerProps) {
  const preview = previewProductModifiers(product, choices);
  const totalSelected = Object.values(choices).reduce((sum, values) => sum + values.length, 0);
  return (
    <section className="order-modifier-picker" aria-label={text.chooseModifiers}>
      <h3>
        {text.chooseModifiers}: {product.name}
      </h3>
      {product.modifierGroups.map((binding) => {
        const selected = choices[binding.id] ?? [];
        return (
          <fieldset key={binding.id} disabled={disabled}>
            <legend>
              {binding.group.name} ·{' '}
              {binding.group.required ? text.requiredModifierGroup : text.optionalModifierGroup}
            </legend>
            <p>
              {text.modifierSelectionRange
                .replace('{min}', String(binding.group.minSelections))
                .replace('{max}', String(binding.group.maxSelections))}
            </p>
            {binding.group.options.map((option) => {
              const checked = selected.includes(option.id);
              return (
                <label key={option.id} className="inline">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={
                      !checked &&
                      (selected.length >= binding.group.maxSelections ||
                        totalSelected >= MAX_LINE_SELECTED_MODIFIERS)
                    }
                    onChange={() => onToggle(binding.id, option.id)}
                  />
                  <span>{option.name}</span>
                  <small>+{option.extraPrice} MDL</small>
                </label>
              );
            })}
          </fieldset>
        );
      })}
      <p>
        <strong>
          {text.modifierUnitPrice}: {preview.unitPrice} MDL
        </strong>
      </p>
      <div className="inline">
        <Button type="button" variant="secondary" disabled={disabled} onClick={onCancel}>
          {text.cancel}
        </Button>
        <Button
          type="button"
          disabled={disabled || !available || !preview.valid}
          onClick={onConfirm}
        >
          {text.addConfiguredProduct}
        </Button>
      </div>
      {!available && <p className="scope-hint">{text.productChanged}</p>}
    </section>
  );
}
