import { roMessages, Badge, PageTitle } from '@pos/ui';
import type { WorkspaceComponentProps } from '../model/workspace.types';
import { AccessPreview } from '../../../entities/access';
export function AccessSection({ model }: WorkspaceComponentProps) {
  const { api, locationId, actor, locationName } = model;
  return (
    <>
      <PageTitle title={roMessages.message262} description={roMessages.message263} />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{actor.displayName}</h2>
            <p>{locationId ? locationName(locationId) : roMessages.message264}</p>
          </div>
          <Badge tone="accent">
            {actor.isPrimaryAdmin ? roMessages.message194 : roMessages.message220}
          </Badge>
        </div>
        <div className="panel-body">
          <AccessPreview
            key={locationId}
            api={api}
            scope={locationId ? 'LOCATION' : 'ORGANIZATION'}
            locationId={locationId}
            userId={actor.id}
          />
        </div>
      </section>
    </>
  );
}
