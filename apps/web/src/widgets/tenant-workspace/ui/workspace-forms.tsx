import type { Location, Role, User } from '@pos/ui/types';
import type { WorkspaceComponentProps } from '../model/workspace.types';
import { LocationForm } from '../../../features/location-management';
import { StaffForm } from '../../../features/staff-management';
import { RoleForm } from '../../../features/role-management';
import { DelegationForm } from '../../../features/delegation-management';
import { AccessForm } from '../../../features/access-management';
export function WorkspaceForms({ model }: WorkspaceComponentProps) {
  const { api, users, roles, catalog, modal, setCredential, saved, locations } = model;
  return (
    <>
      {modal?.kind === 'location' && (
        <LocationForm
          api={api}
          location={modal.value as Location | undefined}
          onSaved={() => void saved()}
        />
      )}
      {modal?.kind === 'staff' && (
        <StaffForm
          api={api}
          user={modal.value as User | undefined}
          users={users}
          locations={locations}
          roles={roles}
          catalog={catalog}
          onSaved={() => void saved()}
          onCredential={setCredential}
        />
      )}
      {modal?.kind === 'role' && (
        <RoleForm
          api={api}
          role={modal.value as Role | undefined}
          catalog={catalog}
          onSaved={() => void saved()}
        />
      )}
      {modal?.kind === 'delegation' && (
        <DelegationForm
          api={api}
          users={users}
          locations={locations}
          catalog={catalog}
          onSaved={() => void saved()}
        />
      )}
      {modal?.kind === 'access' && (
        <AccessForm
          api={api}
          user={modal.value as User}
          locations={locations}
          roles={roles}
          catalog={catalog}
          onSaved={() => void saved()}
        />
      )}
    </>
  );
}
