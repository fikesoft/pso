import { Badge, Button } from '@pos/ui';
import { modifierMessages as text, operationalMessages as common } from '@pos/ui/locales';
import type { ModifierGroupListProps } from '../model/modifier-management.types';

export function GroupList({ model }: ModifierGroupListProps) {
  return (
    <div className="operation-product-grid">
      {model.groups.data?.modifierGroups.map((group) => (
        <article className="operation-product-card" key={group.id}>
          <div className="operation-card-heading">
            <h3>{group.name}</h3>
            <Badge>{group.status === 'ACTIVE' ? common.active : common.archived}</Badge>
          </div>
          <p>
            {group.required ? text.required : text.optional} · {text.choices}: {group.minSelections}
            –{group.maxSelections}
          </p>
          <p className="muted text-small">
            {group.options.map((option) => option.name).join(', ') || text.noOptions}
          </p>
          <div className="attendance-controls">
            <Button variant="secondary" onClick={() => model.edit(group)}>
              {text.editGroup}
            </Button>
            <Button variant="secondary" onClick={() => model.setSelected(group)}>
              {text.options}
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
