import { Button } from '@pos/ui';
import { kitchenCourseMessages as text } from '@pos/ui/locales';
import type { KitchenCourseActionsProps } from '../model/kitchen-board.types';

export function KitchenCourseActions({ ticket, disabled, onFire }: KitchenCourseActionsProps) {
  const pending = ([1, 2, 3] as const).filter((course) =>
    ticket.batches.some(
      (batch) =>
        batch.courseNumber === course && batch.firedAt === null && batch.status === 'QUEUED',
    ),
  );
  if (!pending.length || ticket.status === 'CANCELLED') return null;
  return (
    <div>
      <p className="section-note">{text.allStations}</p>
      <div className="inline">
        {pending.map((course) => (
          <Button
            key={course}
            variant="secondary"
            disabled={disabled}
            onClick={() => onFire(ticket, course)}
          >
            {text.fire}: {text.labels[course]}
          </Button>
        ))}
        <Button disabled={disabled} onClick={() => onFire(ticket, 'ALL')}>
          {text.fireAll}
        </Button>
      </div>
    </div>
  );
}
