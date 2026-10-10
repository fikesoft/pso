import { Empty } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import { DeliveryZones } from '../../../features/delivery-zones';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function DeliveryZonesSection({ model }: WorkspaceComponentProps) {
  if (!model.locationId || !model.context)
    return <Empty title={text.chooseLocation} description={text.chooseLocationHint} />;
  return (
    <DeliveryZones
      key={`${model.context.organization.id}:${model.actor.id}:${model.locationId}`}
      organizationId={model.context.organization.id}
      actorUserId={model.actor.id}
      locationId={model.locationId}
      locationName={model.locationName(model.locationId)}
      timezone={model.locations.find((location) => location.id === model.locationId)?.timezone}
      api={model.api}
      canRead={model.can('delivery.zones.read')}
      canManage={model.can('delivery.zones.manage')}
    />
  );
}
