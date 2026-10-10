import { roMessages, Button, Badge, ShieldCheck, Empty, Loading, PageTitle, Plus } from '@pos/ui';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function RolesSection({ model }: WorkspaceComponentProps) {
  const { loading, roles, setModal, can, labelPermission } = model;
  return (
    <>
      <PageTitle title={roMessages.message224} description={roMessages.message225}>
        {can('roles.manage') && (
          <Button onClick={() => setModal({ kind: 'role' })}>
            <Plus size={16} />
            {roMessages.message226}
          </Button>
        )}
      </PageTitle>
      {loading ? (
        <Loading />
      ) : !roles.length ? (
        <section className="panel">
          <Empty title={roMessages.message227} description={roMessages.message228} />
        </section>
      ) : (
        <div className="role-cards">
          {roles.map((r) => {
            const latest = r.versions.at(-1);
            return (
              <article className="role-card" key={r.id}>
                <div className="role-card-head">
                  <span className="workspace-avatar">
                    <ShieldCheck size={19} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <h3>{r.name}</h3>
                    <span className="text-small muted">
                      {r.versions.length}{' '}
                      {r.versions.length === 1 ? roMessages.message229 : roMessages.message230}{' '}
                      {roMessages.message231}
                    </span>
                  </div>
                  <Badge tone="accent">
                    {roMessages.message232}
                    {latest?.version}
                  </Badge>
                </div>
                <p>{r.description || roMessages.message233}</p>
                <div className="eyebrow">{roMessages.message094}</div>
                <div className="permission-tags">
                  {latest?.permissions.map((p) => (
                    <Badge key={p.permission}>{labelPermission(p.permission)}</Badge>
                  ))}
                </div>
                <div className="form-footer">
                  <Button
                    variant="ghost"
                    onClick={() => setModal({ kind: 'role-history', value: r })}
                  >
                    {roMessages.message234}
                  </Button>
                  {can('roles.manage') && (
                    <Button
                      variant="secondary"
                      onClick={() => setModal({ kind: 'role', value: r })}
                    >
                      <Plus size={14} />
                      {roMessages.message235}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
