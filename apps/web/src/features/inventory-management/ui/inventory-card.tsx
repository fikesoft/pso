import { Badge, Button } from '@pos/ui';
import { inventoryMessages as text, operationalMessages } from '@pos/ui/locales';
import { INVENTORY_KIND_LABELS, INVENTORY_UNIT_SYMBOLS } from '../config/inventory.constants';
import type { InventoryCardProps } from '../model/inventory.types';
export function InventoryCard({
  item,
  canManageItems,
  canManageStock,
  onEdit,
  onMovement,
}: InventoryCardProps) {
  const negative = item.balance?.startsWith('-');
  return (
    <article className="inventory-card">
      <div className="operation-card-heading">
        <h3>{item.name}</h3>
        <Badge>{item.status === 'ACTIVE' ? text.active : text.archive}</Badge>
      </div>
      <div className="inventory-metadata">
        <span>{item.sku}</span>
        <span>{INVENTORY_KIND_LABELS[item.kind]}</span>
      </div>
      {item.balance === null ? (
        <p className="scope-hint">{text.noBalance}</p>
      ) : (
        <div>
          <p className={negative ? 'inventory-negative' : ''}>
            {text.balance}:{' '}
            <strong>
              {item.balance} {INVENTORY_UNIT_SYMBOLS[item.unit]}
            </strong>
          </p>
          <p>
            {text.reserved}:{' '}
            <strong>
              {item.reservedQuantity} {INVENTORY_UNIT_SYMBOLS[item.unit]}
            </strong>
          </p>
          <p>
            {text.available}:{' '}
            <strong>
              {item.availableQuantity} {INVENTORY_UNIT_SYMBOLS[item.unit]}
            </strong>
          </p>
        </div>
      )}
      {negative && <Badge tone="warning">{text.negative}</Badge>}
      <div className="form-footer">
        {canManageItems && (
          <Button variant="ghost" onClick={onEdit}>
            {operationalMessages.edit}
          </Button>
        )}
        {canManageStock && item.balance !== null && (
          <>
            <Button variant="secondary" onClick={() => onMovement('RECEIPT')}>
              {text.receipt}
            </Button>
            <Button variant="secondary" onClick={() => onMovement('WASTE')}>
              {text.waste}
            </Button>
            <Button variant="secondary" onClick={() => onMovement('COUNT')}>
              {text.count}
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
