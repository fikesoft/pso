import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import type { Api } from '../../../shared/api';
import type { AttendanceMutation } from './attendance.types';
import { mutateAttendance } from '../api/attendance.api';

export function useAttendanceAction(api: Api, onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AttendanceMutation | null>(null);
  const inFlight = useRef(false);
  const unconfirmed = useRef(false);
  const lifetime = useRef(0);
  useEffect(
    () => () => {
      lifetime.current++;
    },
    [],
  );
  async function submit(mutation?: AttendanceMutation) {
    if (inFlight.current) return;
    pending.current ??= mutation ?? null;
    if (!pending.current) return;
    inFlight.current = true;
    const generation = lifetime.current;
    setBusy(true);
    setError('');
    try {
      await mutateAttendance(api, pending.current);
      if (generation !== lifetime.current) return;
      pending.current = null;
      unconfirmed.current = false;
      setUncertain(false);
      onSaved();
    } catch (error) {
      if (generation !== lifetime.current) return;
      unconfirmed.current ||=
        !axios.isAxiosError(error) || !error.response || error.response.status >= 500;
      setUncertain(unconfirmed.current);
      setError(errorMessage(error));
      if (!unconfirmed.current) pending.current = null;
    } finally {
      inFlight.current = false;
      if (generation === lifetime.current) setBusy(false);
    }
  }
  return { submit, busy, uncertain, error, locked: busy || uncertain };
}
