import { Badge, Button } from '@pos/ui';
import { websiteDeliveryMessages as text } from '@pos/ui/locales';
import type { WebsiteConnectionCardProps } from '../model/website-delivery.types';
import { WebsiteKeys } from './website-keys';
export function WebsiteConnectionCard({ connection, model }: WebsiteConnectionCardProps) {
  return (
    <article className="website-card">
      <div className="operation-card-heading">
        <h3>{connection.name}</h3>
        <Badge tone={connection.status === 'ACTIVE' ? 'success' : 'warning'}>
          {connection.status === 'ACTIVE' ? text.active : text.paused}
        </Badge>
      </div>
      <p>
        {connection.locationName} · {connection.locationCode}
      </p>
      <p>{text.pauseHint}</p>
      <div className="website-delivery-actions">
        <Button variant="secondary" busy={model.busy} onClick={() => void model.toggle(connection)}>
          {connection.status === 'ACTIVE' ? text.pause : text.resume}
        </Button>
        <Button
          disabled={model.busy || connection.status !== 'ACTIVE'}
          onClick={() => model.open({ kind: 'key', connection })}
        >
          {text.generate}
        </Button>
      </div>
      <WebsiteKeys connection={connection} model={model} />
    </article>
  );
}
