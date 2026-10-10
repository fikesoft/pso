import { useCallback, useEffect, useState } from 'react';
import type { AttendanceActionRequest } from '@pos/contracts';
import { useRemoteData } from '../../../shared/lib';
import { readCurrent, readHistory } from '../api/attendance.api';
import { useAttendanceAction } from './use-attendance-action';
import type { AttendanceClockProps } from './attendance.types';

export function useAttendanceClock({ api, locationId, userId }: AttendanceClockProps) {
  const current = useRemoteData(useCallback(() => readCurrent(api, locationId), [api, locationId]));
  const history = useRemoteData(
    useCallback(() => readHistory(api, locationId, userId), [api, locationId, userId]),
  );
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [saved, setSaved] = useState(false);
  const reload = useCallback(() => {
    void current.refresh();
    void history.refresh();
  }, [current.refresh, history.refresh]);
  const action = useAttendanceAction(api, () => {
    setConfirmEnd(false);
    setSaved(true);
    reload();
  });
  useEffect(() => {
    if (action.locked) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void current.refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [action.locked, current.refresh]);
  function start() {
    setSaved(false);
    void action.submit({ kind: 'start', body: { locationId, requestKey: crypto.randomUUID() } });
  }
  function change(value: AttendanceActionRequest['action']) {
    const shift = current.data?.shift;
    if (!shift) return;
    setSaved(false);
    void action.submit({
      kind: 'action',
      shiftId: shift.id,
      body: { action: value, version: shift.version, requestKey: crypto.randomUUID() },
    });
  }
  async function more() {
    const cursor = history.data?.nextCursor;
    if (cursor)
      await history.append(
        () => readHistory(api, locationId, userId, cursor),
        (previous, next) => ({ ...next, shifts: [...previous.shifts, ...next.shifts] }),
      );
  }
  return {
    locationId,
    current,
    history,
    action,
    confirmEnd,
    setConfirmEnd,
    saved,
    reload,
    start,
    change,
    more,
  };
}
