import { Button, Notice, PageTitle } from '@pos/ui';
import { inventoryMessages as text, operationalMessages } from '@pos/ui/locales';
import type { InventoryManagementProps } from '../model/inventory.types';
import { useInventoryManagement } from '../model/use-inventory-management';
import { StockPanel } from './stock-panel';
import { RecipePanel } from './recipe-panel';
import { LedgerPanel } from './ledger-panel';
import { ItemDialog } from './item-dialog';
import { MovementDialog } from './movement-dialog';
export function InventoryManagement(props: InventoryManagementProps) {
  const model = useInventoryManagement(props);
  return (
    <section>
      <PageTitle title={text.title} eyebrow={props.locationName} description={text.description}>
        <Button
          variant="secondary"
          busy={model.items.loading}
          onClick={() => void model.items.refresh()}
        >
          {operationalMessages.refresh}
        </Button>
        {props.canManageItems && (
          <Button onClick={() => model.setDialog({ kind: 'item', item: null })}>
            {text.newItem}
          </Button>
        )}
      </PageTitle>
      <div className="inventory-tabs" role="group" aria-label={text.tabs}>
        <Button
          variant={model.view === 'stock' ? 'primary' : 'secondary'}
          aria-pressed={model.view === 'stock'}
          onClick={() => model.setView('stock')}
        >
          {text.stock}
        </Button>
        {props.canManageRecipes && (
          <Button
            variant={model.view === 'recipes' ? 'primary' : 'secondary'}
            aria-pressed={model.view === 'recipes'}
            onClick={() => model.setView('recipes')}
          >
            {text.recipes}
          </Button>
        )}
        {props.canViewStock && (
          <Button
            variant={model.view === 'ledger' ? 'primary' : 'secondary'}
            aria-pressed={model.view === 'ledger'}
            onClick={() => model.setView('ledger')}
          >
            {text.ledger}
          </Button>
        )}
      </div>
      {model.items.error && <Notice>{model.items.error}</Notice>}
      {model.notice && <Notice tone="success">{model.notice}</Notice>}
      {!props.locationId && <Notice tone="info">{operationalMessages.chooseLocationHint}</Notice>}
      {model.view === 'stock' && <StockPanel model={model} />}
      {model.view === 'recipes' && props.canManageRecipes && <RecipePanel model={model} />}
      {model.view === 'ledger' && props.canViewStock && <LedgerPanel model={model} />}
      {model.dialog?.kind === 'item' && (
        <ItemDialog
          api={props.api}
          item={model.dialog.item}
          locationId={props.locationId}
          onClose={() => model.setDialog(null)}
          onSaved={() => model.saved(operationalMessages.saved)}
        />
      )}
      {model.dialog?.kind === 'movement' && (
        <MovementDialog
          api={props.api}
          item={model.dialog.item}
          kind={model.dialog.movementKind}
          locationId={props.locationId}
          onClose={() => model.setDialog(null)}
          onSaved={() => model.saved(text.movementSaved)}
        />
      )}
    </section>
  );
}
