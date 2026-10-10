import { Empty } from '@pos/ui';
import { customerManagementMessages as text, operationalMessages } from '@pos/ui/locales';
import { CustomerManagement } from '../../../features/customer-management';
import { canUseOrganization } from '../lib/organization-permission';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function CustomerSection({ model }: WorkspaceComponentProps) {
  if (!canUseOrganization(model, 'customers.read'))
    return <Empty title={text.noAccess} description={text.description} />;
  if (!model.locationId)
    return (
      <Empty
        title={operationalMessages.chooseLocation}
        description={operationalMessages.chooseLocationHint}
      />
    );
  return (
    <CustomerManagement
      key={`${model.context!.organization.id}:${model.actor.id}:${model.locationId}`}
      api={model.api}
      organizationId={model.context!.organization.id}
      actorUserId={model.actor.id}
      locationId={model.locationId}
      locationName={model.locationName(model.locationId)}
      canManageAddresses={canUseOrganization(model, 'customers.addresses.manage')}
      canReadAnalytics={canUseOrganization(model, 'customers.analytics.read')}
      canReadOrders={model.can('orders.read')}
      canCreate={canUseOrganization(model, 'customers.create')}
      canUpdate={canUseOrganization(model, 'customers.update')}
      canArchive={canUseOrganization(model, 'customers.archive')}
    />
  );
}
