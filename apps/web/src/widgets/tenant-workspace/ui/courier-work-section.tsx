import { Empty } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import { CourierWork } from '../../../features/courier-work';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function CourierWorkSection({ model }: WorkspaceComponentProps) {
  if (!model.locationId || !model.context)
    return <Empty title={text.chooseLocation} description={text.chooseLocationHint} />;
  return (
    <CourierWork
      key={`${model.context.organization.id}:${model.actor.id}:${model.locationId}`}
      organizationId={model.context.organization.id}
      actorUserId={model.actor.id}
      locationId={model.locationId}
      locationName={model.locationName(model.locationId)}
      api={model.api}
      canRead={model.can('orders.read') && model.can('delivery.update')}
    />
  );
}
