import { kitchenAlertMessages as text, kitchenCourseMessages as courses } from '@pos/ui/locales';
import { formatKitchenDuration, kitchenElapsed } from '../lib/kitchen-time';
import type { KitchenTimerProps } from '../model/kitchen-board.types';

export function KitchenTimer({ createdAt, completedAt, now, fromRelease }: KitchenTimerProps) {
  const seconds = kitchenElapsed(createdAt, completedAt, now);
  const label = completedAt ? text.finishedDuration : fromRelease ? courses.elapsed : text.elapsed;
  return (
    <p role="timer" aria-live="off" aria-label={label}>
      {label}:{' '}
      {seconds === undefined ? (
        text.syncTime
      ) : (
        <time dateTime={`PT${seconds}S`}>{formatKitchenDuration(seconds)}</time>
      )}
    </p>
  );
}
