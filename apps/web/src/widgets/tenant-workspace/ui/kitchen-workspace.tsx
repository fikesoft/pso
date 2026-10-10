import { useState } from 'react';
import { Button } from '@pos/ui';
import { stationMessages as text, kitchenAlertMessages } from '@pos/ui/locales';
import { KitchenBoard } from '../../../features/kitchen-board';
import { StationConfiguration, RoutingConfiguration } from '../../../features/kitchen-stations';
import { AlertConfiguration } from '../../../features/kitchen-alerts';
import type { WorkspaceComponentProps } from '../model/workspace.types';
import { canUseOrganization } from '../lib/organization-permission';
export function KitchenWorkspace({ model }: WorkspaceComponentProps) {
  const [configure, setConfigure] = useState<'STATION' | 'ROUTING' | 'ALERTS' | null>(null);
  const canManage = model.can('kitchen.read') && model.can('kitchen.stations.manage');
  const canManageOrganization = canUseOrganization(model, 'kitchen.alerts.manage');
  const canManageLocation = model.can('kitchen.alerts.manage');
  if (configure === 'ALERTS' && (canManageOrganization || canManageLocation))
    return (
      <AlertConfiguration
        key={`${model.context!.organization.id}:${model.actor.id}:${model.locationId}`}
        api={model.api}
        organizationId={model.context!.organization.id}
        actorUserId={model.actor.id}
        locationId={model.locationId!}
        canManageOrganization={canManageOrganization}
        canManageLocation={canManageLocation}
        onBack={() => setConfigure(null)}
      />
    );
  const Configuration = configure === 'ROUTING' ? RoutingConfiguration : StationConfiguration;
  if ((configure === 'STATION' || configure === 'ROUTING') && canManage)
    return (
      <Configuration
        api={model.api}
        organizationId={model.context!.organization.id}
        actorUserId={model.actor.id}
        locationId={model.locationId!}
        can={model.can}
        onBack={() => setConfigure(null)}
      />
    );
  return (
    <>
      {(canManageOrganization || canManageLocation) && (
        <Button variant="secondary" onClick={() => setConfigure('ALERTS')}>
          {kitchenAlertMessages.configuration}
        </Button>
      )}
      {canManage && (
        <div className="inline">
          <Button variant="secondary" onClick={() => setConfigure('STATION')}>
            {text.configuration}
          </Button>
          <Button variant="secondary" onClick={() => setConfigure('ROUTING')}>
            {text.routing}
          </Button>
        </div>
      )}
      {model.can('kitchen.read') && (
        <KitchenBoard
          organizationId={model.context!.organization.id}
          actorUserId={model.actor.id}
          api={model.api}
          locationId={model.locationId!}
          locationName={model.locationName(model.locationId!)}
          actorName={model.actor.displayName}
          can={model.can}
          canManageCatalog={false}
        />
      )}
    </>
  );
}
