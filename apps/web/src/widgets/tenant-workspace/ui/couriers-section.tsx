import { Empty } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import { Couriers } from '../../../features/couriers';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function CouriersSection({ model }: WorkspaceComponentProps) {
  if (!model.locationId || !model.context)
    return <Empty title={text.chooseLocation} description={text.chooseLocationHint} />;
  return (
    <Couriers
      key={`${model.context.organization.id}:${model.actor.id}:${model.locationId}`}
      organizationId={model.context.organization.id}
      actorUserId={model.actor.id}
      locationId={model.locationId}
      locationName={model.locationName(model.locationId)}
      api={model.api}
      canRead={model.can('couriers.read')}
      canManage={model.can('couriers.manage')}
      canOwn={model.can('couriers.availability')}
    />
  );
}
