import { WebsiteDelivery } from '../../../features/website-delivery';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function WebsiteDeliverySection({ model }: WorkspaceComponentProps) {
  return (
    <WebsiteDelivery
      key={`${model.context?.organization.id}:${model.locationId}`}
      api={model.api}
      locationId={model.locationId}
      locationName={model.locationId ? model.locationName(model.locationId) : model.name}
      locations={model.locations}
      canManage={model.actor.isPrimaryAdmin === true}
      canRead={!!model.locationId && model.can('orders.read')}
      canDecide={!!model.locationId && model.can('orders.read') && model.can('orders.create')}
      onOpenOrders={() => model.navigate('orders')}
    />
  );
}
