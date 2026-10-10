import { roMessages, Button, Badge } from '@pos/ui';
import type { User } from '@pos/ui/types';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function PersonOverrides({ model }: WorkspaceComponentProps) {
  const person = model.modal!.value as User;
  const { setModal, can, labelPermission, locationName } = model;
  return (
    <>
      {!!person.overrides?.length && (
        <>
          <h3 className="section-subtitle">{roMessages.message315}</h3>
          {person.overrides.map((o) => (
            <div className="check-row" key={o.id}>
              <Badge tone={o.effect === 'DENY' ? 'danger' : 'success'}>{o.effect}</Badge>
              <span>
                {labelPermission(o.permission)}
                <small className="row-detail" style={{ display: 'block' }}>
                  {locationName(o.locationId)}
                </small>
              </span>
              {can('staff.access') && (
                <Button
                  variant="ghost"
                  onClick={() => setModal({ kind: `remove-override:${o.id}`, value: person })}
                >
                  {roMessages.message316}
                </Button>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}
