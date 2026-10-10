import { Button, Empty, Loading } from '@pos/ui';
import { inventoryMessages as text } from '@pos/ui/locales';
import type { InventoryComponentProps } from '../model/inventory.types';
import { InventoryCard } from './inventory-card';
export function StockPanel({ model }: InventoryComponentProps) {
  if (model.items.loading) return <Loading />;
  const items = model.items.data?.items ?? [];
  return (
    <>
      {items.length > 0 && <p className="scope-hint">{text.stockHint}</p>}
      {!items.length ? (
        <Empty title={text.noItems} description={text.noItemsHint} />
      ) : (
        <div className="inventory-cards">
          {items.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              canManageItems={model.canManageItems}
              canManageStock={model.canManageStock}
              onEdit={() => model.setDialog({ kind: 'item', item })}
              onMovement={(movementKind) =>
                model.setDialog({ kind: 'movement', item, movementKind })
              }
            />
          ))}
        </div>
      )}
      {model.items.data?.nextCursor && (
        <Button
          variant="secondary"
          busy={model.items.loadingMore}
          onClick={() => void model.moreItems()}
        >
          {text.moreItems}
        </Button>
      )}
    </>
  );
}
