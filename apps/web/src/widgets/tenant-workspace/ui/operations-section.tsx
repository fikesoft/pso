import { Empty } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import { OrderEntry, OperatorOrderEntry } from '../../../features/order-entry';
import { KitchenWorkspace } from './kitchen-workspace';
import { PackingBoard } from '../../../features/packing-board';
import { CatalogWorkspace } from './catalog-workspace';
import { canUseOrganization } from '../lib/organization-permission';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function OperationsSection({ model }: WorkspaceComponentProps) {
  if (!model.locationId)
    return <Empty title={text.chooseLocation} description={text.chooseLocationHint} />;
  const canManageCatalog = canUseOrganization(model, 'catalog.manage');
  const props = {
    api: model.api,
    locationId: model.locationId,
    locationName: model.locationName(model.locationId),
    actorName: model.actor.displayName,
    can: model.can,
    canManageCatalog,
  };
  const key = `${model.context?.organization.id}:${model.locationId}`;
  if (model.view === 'packing')
    return (
      <PackingBoard
        key={`${key}:${model.actor.id}`}
        {...props}
        organizationId={model.context!.organization.id}
        actorUserId={model.actor.id}
      />
    );
  if (model.view === 'catalog')
    return (
      <CatalogWorkspace
        key={key}
        {...props}
        canManageRecipes={canUseOrganization(model, 'inventory.recipes.manage')}
      />
    );
  const Entry = model.view === 'orders' ? OrderEntry : OperatorOrderEntry;
  if (model.view === 'orders' || model.view === 'operator' || model.view === 'cashier')
    return (
      <Entry
        key={`${key}:${model.actor.id}`}
        {...props}
        mode={model.view === 'cashier' ? 'cashier' : 'operator'}
        organizationId={model.context!.organization.id}
        actorUserId={model.actor.id}
        canReadCustomers={canUseOrganization(model, 'customers.read')}
        canCreateCustomers={canUseOrganization(model, 'customers.create')}
        canManageAddresses={canUseOrganization(model, 'customers.addresses.manage')}
      />
    );
  return <KitchenWorkspace key={`${key}:${model.actor.id}`} model={model} />;
}
