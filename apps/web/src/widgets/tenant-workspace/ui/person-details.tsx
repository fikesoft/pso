import { roMessages, pinMessages, formatMessage, Button, Badge } from '@pos/ui';
import type { User } from '@pos/ui/types';
import type { PersonDetailsProps } from '../model/workspace.types';
import { initials, active, statusLabel } from '../lib/presentation';
import { AccessPreview } from '../../../entities/access';
import { PersonAssignments } from './person-assignments';
import { PersonOverrides } from './person-overrides';
import { SessionManagement } from '../../../features/session-management';
import { WorkspaceEmployeeProfile } from './workspace-employee-profile';
import { ResourceImage } from '../../../entities/file-asset';
export function PersonDetails({ model, onLockedChange, imageLocked }: PersonDetailsProps) {
  const selected = model.modal!.value as User;
  const person = model.users.find((user) => user.id === selected.id) ?? selected;
  const { api, locationId, context, setModal, setModalError, can, locationName, actor } = model;
  return (
    <div className="stack">
      <div className="details-block">
        <div className="inline">
          <ResourceImage
            src={person.avatarUrl}
            alt={person.displayName}
            fallback={initials(person.displayName)}
            className="avatar-photo"
          />
          <div>
            <strong>{person.displayName}</strong>
            <div className="row-detail">
              {roMessages.message306} {person.login}
            </div>
          </div>
          <Badge>
            {person.authenticationMethod === 'PIN'
              ? pinMessages.pinBadge
              : pinMessages.passwordBadge}
          </Badge>
          <Badge tone={active(person.status) ? 'success' : 'neutral'}>
            {statusLabel(person.status)}
          </Badge>
        </div>
        <p className="scope-hint">
          {person.isPrimaryAdmin
            ? roMessages.message307
            : formatMessage(
                roMessages.message308,
                (person.locationIds || []).map((id) => locationName(id)).join(', ') ||
                  roMessages.message222,
              )}
        </p>
      </div>
      {person.authenticationMethod === 'PASSWORD' &&
        person.mustChangePassword &&
        person.mfaRequired && <p className="scope-hint">{pinMessages.promotionHint}</p>}
      <PersonAssignments model={model} />
      <WorkspaceEmployeeProfile
        model={model}
        userId={person.id}
        editable={person.id === actor.id || (can('staff.manage') && !person.isPrimaryAdmin)}
        onLockedChange={onLockedChange}
      />
      <PersonOverrides model={model} />
      <AccessPreview
        api={api}
        scope={locationId ? 'LOCATION' : 'ORGANIZATION'}
        locationId={locationId}
        userId={person.id}
      />
      {(person.id === actor.id || (can('staff.credentials.reset') && !person.isPrimaryAdmin)) && (
        <SessionManagement
          api={api}
          userId={person.id}
          currentUserId={actor.id}
          onCurrentSessionRevoked={model.revokedExit}
        />
      )}
      <fieldset className="form-footer operation-fields" disabled={imageLocked}>
        {can('staff.manage') && !person.isPrimaryAdmin && (
          <Button variant="secondary" onClick={() => setModal({ kind: 'staff', value: person })}>
            {roMessages.message209}
          </Button>
        )}
        {(can('staff.access') ||
          context?.permissions.some((p) => typeof p !== 'string' && p.canGrant)) &&
          !person.isPrimaryAdmin && (
            <Button onClick={() => setModal({ kind: 'access', value: person })}>
              {roMessages.message298}
            </Button>
          )}
        {can('staff.credentials.reset') && !person.isPrimaryAdmin && !person.mfaRequired && (
          <Button
            variant="secondary"
            onClick={() => {
              setModalError('');
              setModal({ kind: 'reset-pin', value: person });
            }}
          >
            {pinMessages.resetPin}
          </Button>
        )}
        {can('staff.credentials.reset') && !person.isPrimaryAdmin && (
          <Button
            variant="danger"
            onClick={() => {
              setModalError('');
              setModal({ kind: 'reset', value: person });
            }}
          >
            {roMessages.message300}
          </Button>
        )}
      </fieldset>
    </div>
  );
}
