import { Badge, Button } from '@pos/ui';
import { deliveryZoneMessages as text } from '@pos/ui/locales';
import type { ZoneCardProps } from '../model/delivery-zone.types';
import { formatZoneHours } from '../lib/zone-form';
import { ZonePreview } from './zone-preview';
export function ZoneCard({ zone, canManage, locked, onEdit }: ZoneCardProps) {
  const p = zone.profile;
  const points = p.shape.type === 'RADIUS' ? [p.shape.center] : p.shape.vertices;
  return (
    <article className="operation-order-card">
      <div className="operation-card-heading">
        <h3>{p.name}</h3>
        <Badge tone={zone.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {zone.status === 'ACTIVE' ? text.activeStatus : text.archivedStatus}
        </Badge>
      </div>
      <p>
        {text.minimum}: {p.minimumOrder} MDL · {text.fee}: {p.deliveryFee} MDL
      </p>
      <p>
        {text.free}: {p.freeDeliveryFrom === null ? text.noFree : `${p.freeDeliveryFrom} MDL`}
      </p>
      <p>
        {text.eta}: {p.estimatedMinutes} · {text.priority}: {p.priority}
      </p>
      <p>
        {text.hours}: {formatZoneHours(p.activeHours) || text.permanent}
      </p>
      <details>
        <summary>{text.geometry}</summary>
        <p>
          {p.shape.type === 'RADIUS'
            ? `${text.radiusMeters}: ${p.shape.radiusMeters}`
            : text.polygon}
        </p>
        {points.map((point, index) => (
          <p key={index}>
            {point.latitude}, {point.longitude}
          </p>
        ))}
        <ZonePreview shape={p.shape} />
      </details>
      {canManage && (
        <div className="inline">
          {zone.status === 'ACTIVE' && (
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => onEdit({ action: 'UPDATE', zone })}
            >
              {text.edit}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={locked}
            onClick={() =>
              onEdit({ action: zone.status === 'ACTIVE' ? 'ARCHIVE' : 'RESTORE', zone })
            }
          >
            {zone.status === 'ACTIVE' ? text.archive : text.restore}
          </Button>
        </div>
      )}
    </article>
  );
}
