import { Empty } from '@pos/ui';
import { operationalMessages } from '@pos/ui/locales';
import { InventoryManagement } from '../../../features/inventory-management';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function InventorySection({ model }: WorkspaceComponentProps) {
  function canOrganization(key: string) {
    return (
      !!model.actor.isPrimaryAdmin ||
      !!model.context?.permissions.some(
        (entry) =>
          typeof entry !== 'string' &&
          (entry.permission === key || entry.key === key) &&
          entry.canUse !== false &&
          entry.scopeType === 'ORGANIZATION',
      )
    );
  }
  const canManageItems = canOrganization('inventory.manage');
  const canManageRecipes = canOrganization('inventory.recipes.manage');
  if (!model.locationId && !canManageItems && !canManageRecipes)
    return (
      <Empty
        title={operationalMessages.chooseLocation}
        description={operationalMessages.chooseLocationHint}
      />
    );
  return (
    <InventoryManagement
      key={`${model.context?.organization.id}:${model.locationId}`}
      api={model.api}
      locationId={model.locationId}
      locationName={model.locationId ? model.locationName(model.locationId) : model.name}
      canManageItems={canManageItems}
      canManageRecipes={canManageRecipes}
      canViewStock={
        !!model.locationId && (model.can('inventory.read') || model.can('inventory.manage'))
      }
      canManageStock={!!model.locationId && model.can('inventory.manage')}
    />
  );
}
