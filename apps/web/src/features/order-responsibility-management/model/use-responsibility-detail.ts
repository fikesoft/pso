import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  OrderResponsibilityDetailResponse,
  OrderResponsibilityHistoryResponse,
} from '@pos/contracts/order-responsibilities';
import { errorMessage } from '@pos/ui/api';
import {
  readResponsibility,
  readResponsibilityHistory,
} from '../../../entities/order-responsibility';
import { isAccessRejection } from '../../../shared/lib';
import type { ResponsibilityWorkspaceInput } from './responsibility-management.types';
export function useResponsibilityDetail(input: ResponsibilityWorkspaceInput, allowed: boolean) {
  const [data, setData] = useState<OrderResponsibilityDetailResponse | null>(null);
  const [history, setHistory] = useState<OrderResponsibilityHistoryResponse | null>(null);
  const [dataKey, setDataKey] = useState(''),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const key = JSON.stringify([
    input.organizationId,
    input.actorUserId,
    input.locationId,
    input.orderId,
    input.orderVersion,
    allowed,
    input.accessBlocked,
    input.can('orders.handoff'),
    input.can('orders.handoff-others'),
    input.can('cash.reports.read'),
  ]);
  const current = useRef(key);
  current.current = key;
  const epoch = useRef(0);
  const enabled = allowed && !input.accessBlocked && !!input.orderId;
  const load = useCallback(
    async (cursor?: string) => {
      const revision = ++epoch.current;
      setError('');
      if (!cursor) {
        setData(null);
        setHistory(null);
      }
      if (!enabled || !input.orderId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [row, events] = await Promise.all([
          readResponsibility(input.api, input.orderId, input.locationId),
          readResponsibilityHistory(input.api, input.orderId, input.locationId, cursor),
        ]);
        if (revision !== epoch.current || current.current !== key) return;
        setData(row);
        setHistory((previous) => ({
          ...events,
          events:
            cursor && previous
              ? [
                  ...previous.events.filter(
                    (old) => !events.events.some((next) => old.eventId === next.eventId),
                  ),
                  ...events.events,
                ]
              : events.events,
        }));
        setDataKey(key);
      } catch (failure) {
        if (revision === epoch.current && current.current === key) {
          if (isAccessRejection(failure)) {
            setData(null);
            setHistory(null);
          }
          setError(errorMessage(failure));
        }
      } finally {
        if (revision === epoch.current && current.current === key) setLoading(false);
      }
    },
    [input.api, input.orderId, input.locationId, enabled, key],
  );
  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
    };
  }, [load]);
  const visible = enabled && dataKey === key;
  return {
    data: visible ? data : null,
    history: visible ? history : null,
    loading,
    error,
    refresh: () => load(),
    more: () =>
      !loading && visible && history?.nextCursor ? load(history.nextCursor) : Promise.resolve(),
  };
}
