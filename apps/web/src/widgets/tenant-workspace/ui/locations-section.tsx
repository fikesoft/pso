import { roMessages, Button, Badge, Empty, Notice, PageTitle, MapPin, Plus, Pencil } from '@pos/ui';
import type { WorkspaceComponentProps } from '../model/workspace.types';
import { active } from '../lib/presentation';
import { WorkspaceToolbar } from './workspace-toolbar';
import { useCallback } from 'react';
import { locationMessages as text } from '@pos/ui/locales';
import { readBrands } from '../../../entities/brand';
import { useRemoteData } from '../../../shared/lib';
export function LocationsSection({ model }: WorkspaceComponentProps) {
  const { query, setQuery, setModal, can, shownLocations } = model;
  const load = useCallback(() => readBrands(model.api), [model.api]);
  const brands = useRemoteData(load);
  return (
    <>
      <PageTitle title={roMessages.message200} description={roMessages.message201}>
        {can('locations.manage') && (
          <Button onClick={() => setModal({ kind: 'location' })}>
            <Plus size={16} />
            {roMessages.message202}
          </Button>
        )}
      </PageTitle>
      {brands.error && (
        <Notice>
          {brands.error}
          <Button variant="secondary" onClick={() => void brands.refresh()}>
            {text.refresh}
          </Button>
        </Notice>
      )}
      <section className="panel">
        <WorkspaceToolbar
          count={shownLocations.length}
          label={roMessages.message203}
          query={query}
          setQuery={setQuery}
        />
        {!shownLocations.length ? (
          <Empty
            title={roMessages.message204}
            description={query ? roMessages.message205 : roMessages.message206}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{roMessages.message082}</th>
                <th>{roMessages.message109}</th>
                <th>{text.brand}</th>
                <th>{roMessages.message106}</th>
                <th aria-label={roMessages.message207} />
              </tr>
            </thead>
            <tbody>
              {shownLocations.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div className="table-person">
                      <span className="workspace-avatar">
                        <MapPin size={17} />
                      </span>
                      <div>
                        <strong>{l.name}</strong>
                        <small>{l.address || roMessages.message208}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label={roMessages.message435}>{l.code}</td>
                  <td data-label={text.brand}>
                    {l.brandId
                      ? (brands.data?.find((brand) => brand.id === l.brandId)?.name ?? '…')
                      : text.noBrand}
                  </td>
                  <td data-label={roMessages.message106}>
                    <Badge tone={active(l.status) ? 'success' : 'neutral'}>
                      {active(l.status) ? roMessages.message107 : roMessages.message108}
                    </Badge>
                  </td>
                  <td className="actions-cell">
                    {can('locations.manage') && (
                      <Button
                        variant="ghost"
                        onClick={() => setModal({ kind: 'location', value: l })}
                      >
                        <Pencil size={14} />
                        {roMessages.message209}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
