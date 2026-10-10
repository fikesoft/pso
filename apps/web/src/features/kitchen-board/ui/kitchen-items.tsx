import { ModifierSnapshot } from '../../../entities/modifier';
import type { KitchenItemsProps } from '../model/kitchen-board.types';
import { kitchenItemsSeverity } from '../lib/kitchen-severity';
import { KitchenSeverity } from './kitchen-severity';
import { KitchenRecipe } from './kitchen-recipe';
export function KitchenItems({ items, elapsedSeconds, api, ticketId }: KitchenItemsProps) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <strong>
            {item.quantity} × {item.productName}
          </strong>
          <KitchenSeverity severity={kitchenItemsSeverity([item], elapsedSeconds)} />
          <ModifierSnapshot groups={item.modifierGroups} />
          {item.note && <p className="operation-ticket-note">{item.note}</p>}
          <KitchenRecipe api={api} ticketId={ticketId} item={item} />
        </li>
      ))}
    </ul>
  );
}
