import { Badge, Button } from '@pos/ui';
import { courierMessages as text } from '@pos/ui/locales';
import type { CourierCardProps } from '../model/courier.types';
export function CourierCard({
  courier,
  canManage,
  canSetAvailability,
  locked,
  onEdit,
}: CourierCardProps) {
  return (
    <article className="panel panel-body form-stack">
      <div className="operation-card-heading">
        <h3>{courier.displayName}</h3>
        <Badge>{text.statuses[courier.effectiveStatus]}</Badge>
      </div>
      <p>
        {text.vehicle}: {text.vehicles[courier.profile.vehicle]} · {text.capacity}:{' '}
        {courier.profile.capacity}
      </p>
      <p>
        {text.availability}: {text.statuses[courier.availability]} · {text.workload}:{' '}
        {courier.activeDeliveries}
      </p>
      <small>
        {text.version}: {courier.version}
      </small>
      <div className="inline">
        {courier.status === 'ACTIVE' && (
          <>
            {canSetAvailability && (
              <Button
                variant="secondary"
                disabled={locked}
                onClick={() => onEdit({ action: 'SET_AVAILABILITY', courier })}
              >
                {text.changeAvailability}
              </Button>
            )}
            {canManage && (
              <Button
                variant="secondary"
                disabled={locked}
                onClick={() => onEdit({ action: 'UPDATE', courier })}
              >
                {text.edit}
              </Button>
            )}
            {canManage && (
              <Button
                variant="secondary"
                disabled={locked}
                onClick={() => onEdit({ action: 'ARCHIVE', courier })}
              >
                {text.archive}
              </Button>
            )}
          </>
        )}
        {canManage && courier.status === 'ARCHIVED' && (
          <Button
            variant="secondary"
            disabled={locked}
            onClick={() => onEdit({ action: 'RESTORE', courier })}
          >
            {text.restore}
          </Button>
        )}
      </div>
    </article>
  );
}
