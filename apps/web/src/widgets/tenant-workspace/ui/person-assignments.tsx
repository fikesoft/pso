import { roMessages, Button, ShieldCheck } from '@pos/ui';
import type { User } from '@pos/ui/types';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function PersonAssignments({ model }: WorkspaceComponentProps) {
  const person = model.modal!.value as User;
  const { roles, setModal, setModalError, actor, locationName } = model;
  return (
    <>
      <h3 className="section-subtitle">{roMessages.message309}</h3>
      {person.assignments?.length ? (
        person.assignments.map((a) => (
          <div className="check-row" key={a.id}>
            <ShieldCheck size={16} />
            <span>
              {roles.find((r) => r.versions.some((v) => v.id === a.roleVersionId))?.name ||
                roMessages.message152}{' '}
              {roMessages.message142}
              {roles.flatMap((r) => r.versions).find((v) => v.id === a.roleVersionId)?.version ||
                '?'}{' '}
              · {locationName(a.locationId)}
              <small className="row-detail" style={{ display: 'block' }}>
                {a.delegationGrantId ? roMessages.message310 : roMessages.message311}
              </small>
            </span>
            {!person.isPrimaryAdmin && (actor.isPrimaryAdmin || a.issuedByUserId === actor.id) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setModalError('');
                  setModal({ kind: `remove-assignment:${a.id}`, value: person });
                }}
              >
                {roMessages.message312}
              </Button>
            )}
          </div>
        ))
      ) : (
        <p className="text-small muted">
          {person.isPrimaryAdmin ? roMessages.message313 : roMessages.message314}
        </p>
      )}
    </>
  );
}
