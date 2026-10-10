import { Badge, Button } from '@pos/ui';
import { modifierMessages as text, operationalMessages as common } from '@pos/ui/locales';
import type { ModifierOptionListProps } from '../model/modifier-management.types';

export function OptionList({ model }: ModifierOptionListProps) {
  return (
    <div className="operation-product-grid">
      {model.options.data?.modifierOptions.map((option) => (
        <article className="operation-product-card" key={option.id}>
          <div className="operation-card-heading">
            <h3>{option.name}</h3>
            <Badge>{option.status === 'ACTIVE' ? common.active : common.archived}</Badge>
          </div>
          <p>+{option.extraPrice} MDL</p>
          <Button variant="secondary" onClick={() => model.edit(option)}>
            {text.editOption}
          </Button>
        </article>
      ))}
    </div>
  );
}
