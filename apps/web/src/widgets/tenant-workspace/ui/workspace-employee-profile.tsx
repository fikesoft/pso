import { EmployeeProfile } from '../../../features/employee-profile';
import { ResourceImageEditor } from '../../../features/media-management';
import type { WorkspaceEmployeeProfileProps } from '../model/workspace.types';

export function WorkspaceEmployeeProfile({
  model,
  userId,
  editable,
  onLockedChange,
}: WorkspaceEmployeeProfileProps) {
  return (
    <EmployeeProfile
      key={`${userId}:${model.locationId}`}
      api={model.api}
      userId={userId}
      locationId={model.locationId}
      onLockedChange={onLockedChange}
      timezone={
        model.locations.find((location) => location.id === model.locationId)?.timezone ??
        model.context?.organization.timezone
      }
      renderImage={(user, refresh, lockProfile) => (
        <ResourceImageEditor
          api={model.api}
          resource={{ kind: 'employee', id: user.id, version: user.version, url: user.avatarUrl }}
          editable={editable}
          onLockedChange={lockProfile}
          onSaved={async () => {
            await model.loadView();
            await refresh();
          }}
        />
      )}
    />
  );
}
