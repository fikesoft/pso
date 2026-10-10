import { useEffect, useState } from 'react';
import type { KitchenBoardData } from './kitchen-board.types';
import { kitchenServerNow } from '../lib/kitchen-time';
import { KITCHEN_TIMER_INTERVAL_MS } from '../config/timer.constants';

export function useKitchenClock(data: KitchenBoardData | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    const update = () => tick((value) => value + 1);
    const timer = setInterval(update, KITCHEN_TIMER_INTERVAL_MS);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const sample =
    data &&
    Object.values(data).reduce((latest, page) =>
      page.receivedAt > latest.receivedAt ? page : latest,
    );
  return sample
    ? kitchenServerNow(sample.serverTime, sample.receivedAt, performance.now())
    : undefined;
}
