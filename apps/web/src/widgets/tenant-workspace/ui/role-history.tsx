import { roMessages, Badge } from '@pos/ui';
import type { Role } from '@pos/ui/types';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function RoleHistory({ model }: WorkspaceComponentProps) {
  const { modal, labelPermission } = model;
  return (
    <>
      {modal?.kind === 'role-history' && (
        <div className="stack">
          {(modal.value as Role).versions.map((v) => (
            <div className="details-block" key={v.id}>
              <h3>
                {roMessages.message304} {v.version} <Badge>{roMessages.message305}</Badge>
              </h3>
              <div className="permission-tags">
                {v.permissions.map((p) => (
                  <Badge key={p.permission}>{labelPermission(p.permission)}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
