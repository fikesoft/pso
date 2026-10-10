import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { errorMessage } from '@pos/ui/api';
import { mediaMessages as text } from '@pos/ui/locales';
import { MEDIA_ACCEPTED_TYPES, MEDIA_INPUT_LIMIT } from '../config/media.constants';
import { mutateMedia } from '../api/media.api';
import type { MediaMutation, ResourceImageEditorProps } from './media.types';

export function useMediaEditor({
  api,
  resource,
  onSaved,
  onLockedChange,
}: ResourceImageEditorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const pending = useRef<MediaMutation | null>(null);
  const inFlight = useRef(false);
  const unconfirmed = useRef(false);
  const lifetime = useRef(0);
  const locked = busy || uncertain;
  useEffect(() => {
    onLockedChange?.(locked);
  }, [locked, onLockedChange]);
  useEffect(
    () => () => {
      lifetime.current++;
      onLockedChange?.(false);
    },
    [onLockedChange],
  );
  function chooseFile(next: File | null) {
    if (locked) return;
    setSaved(false);
    setError('');
    if (
      next &&
      (!MEDIA_ACCEPTED_TYPES.includes(next.type) || next.size > MEDIA_INPUT_LIMIT || !next.size)
    ) {
      setFile(null);
      setError(text.invalidFile);
    } else setFile(next);
  }
  async function submit(action?: 'SET' | 'CLEAR') {
    if (inFlight.current) return;
    if (!pending.current && action) {
      if (action === 'SET' && !file) return;
      const base = { resource: { ...resource }, requestKey: crypto.randomUUID() };
      pending.current = action === 'SET' ? { ...base, action, file: file! } : { ...base, action };
    }
    if (!pending.current) return;
    const generation = lifetime.current;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await mutateMedia(api, pending.current);
      if (generation !== lifetime.current) return;
      pending.current = null;
      unconfirmed.current = false;
      setUncertain(false);
      setFile(null);
      setConfirmClear(false);
      setSaved(true);
      try {
        await onSaved();
      } catch (refreshError) {
        if (generation === lifetime.current) setError(errorMessage(refreshError));
      }
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
  return {
    file,
    chooseFile,
    busy,
    uncertain,
    error,
    saved,
    confirmClear,
    setConfirmClear,
    locked,
    submit,
  };
}
