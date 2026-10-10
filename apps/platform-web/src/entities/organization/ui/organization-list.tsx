import { Badge, Empty, Loading, Search, ArrowUpRight, roMessages } from '@pos/ui';
import { tenantLoginUrl } from '../../../shared/lib/tenant-login-url';
import type { OrganizationListProps } from '../model/organization.types';
export function OrganizationList({
  organizations,
  loading,
  query,
  onQueryChange,
}: OrganizationListProps) {
  const rows = organizations.filter((organization) =>
    `${organization.name} ${organization.slug}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="toolbar">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label={roMessages.message356}
            placeholder={roMessages.message357}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
        <small>
          {rows.length} {roMessages.message358}
        </small>
      </div>
      {loading ? (
        <Loading />
      ) : !rows.length ? (
        <Empty
          title={query ? roMessages.message359 : roMessages.message360}
          description={query ? roMessages.message361 : roMessages.message362}
        />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{roMessages.message087}</th>
              <th>{roMessages.message363}</th>
              <th>{roMessages.message106}</th>
              <th aria-label={roMessages.message207} />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>
                  <div className="table-person">
                    <span className="workspace-avatar">{o.name.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <strong>{o.name}</strong>
                      <small>{roMessages.message364}</small>
                    </div>
                  </div>
                </td>
                <td data-label={roMessages.message363}>{o.slug}</td>
                <td data-label={roMessages.message106}>
                  <Badge tone={o.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {o.status === 'ACTIVE'
                      ? roMessages.message107
                      : o.status === 'DISABLED'
                        ? roMessages.message108
                        : o.status || roMessages.message365}
                  </Badge>
                </td>
                <td className="actions-cell">
                  <a className="button button-ghost" href={tenantLoginUrl(o.slug)}>
                    {roMessages.message366}
                    <ArrowUpRight size={14} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
