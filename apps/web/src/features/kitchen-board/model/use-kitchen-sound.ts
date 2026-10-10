import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { kitchenAlertMessages as text } from '@pos/ui/locales';
import { readKitchenArrivals } from '../../../entities/kitchen';
import { useCoalescedInvalidation, useInvalidation } from '../../../shared/lib';
import { createKitchenSound } from '../lib/kitchen-sound';
import { createKitchenArrivalTracker } from '../lib/kitchen-arrival-tracker';
import type { KitchenSoundProps } from './kitchen-board.types';

export function useKitchenSound({ api, locationId, stationId }: KitchenSoundProps) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sound = useRef<ReturnType<typeof createKitchenSound> | null>(null);
  const tracker = useRef(createKitchenArrivalTracker());
  const generation = useRef(0);
  useEffect(() => {
    setEnabled(false);
    setBusy(false);
    setError('');
    tracker.current = createKitchenArrivalTracker();
    return () => {
      generation.current++;
      void sound.current?.close().catch(() => {});
      sound.current = null;
    };
  }, [api, locationId, stationId]);
  function stop() {
    generation.current++;
    setEnabled(false);
    setBusy(false);
    void sound.current?.close().catch(() => {});
    sound.current = null;
  }
  async function enable() {
    if (busy || enabled) return;
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const next = createKitchenSound();
      sound.current = next;
      await next.enable();
      if (current !== generation.current) return;
      tracker.current = createKitchenArrivalTracker();
      setEnabled(true);
    } catch {
      if (current !== generation.current) return;
      stop();
      setError(text.soundUnavailable);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function play() {
    try {
      sound.current?.play();
    } catch {
      stop();
      setError(text.soundUnavailable);
    }
  }
  const signal = useInvalidation(`kitchen:${locationId}`);
  useCoalescedInvalidation(enabled ? signal + 1 : 0, async () => {
    if (!enabled || !sound.current) return;
    const current = generation.current;
    try {
      const arrival = await readKitchenArrivals(api, locationId, stationId);
      if (current !== generation.current) return;
      if (tracker.current.observe(arrival.revision)) play();
    } catch (error) {
      if (current !== generation.current) return;
      stop();
      setError(errorMessage(error));
    }
  });
  return { enabled, busy, error, enable, stop, play };
}
