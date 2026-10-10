import { useCallback, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import type { CreateMenuSchedule, MenuSchedule } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { menuScheduleMessages as text } from '@pos/ui/locales';
import { formText, useRemoteData } from '../../../shared/lib';
import {
  createSchedule,
  readSchedule,
  readSchedules,
  updateSchedule,
} from '../api/menu-schedules.api';
import { scheduleForm } from './schedule-form';
import type { MenuScheduleManagementProps } from './menu-schedules.types';

export function useMenuSchedules({ api, locationId }: MenuScheduleManagementProps) {
  const schedules = useRemoteData(
    useCallback(() => readSchedules(api, locationId), [api, locationId]),
  );
  const [editing, setEditing] = useState<MenuSchedule | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const creation = useRef<CreateMenuSchedule | null>(null);
  function edit(schedule: MenuSchedule | null | undefined) {
    if (pending.current || uncertain) return;
    creation.current = null;
    setError('');
    setEditing(schedule);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || editing === undefined) return;
    const form = new FormData(event.currentTarget);
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (editing) {
        await updateSchedule(api, editing.id, {
          ...scheduleForm(form),
          version: editing.version,
          status: formText(form, 'status') as MenuSchedule['status'],
        });
      } else {
        creation.current ??= { ...scheduleForm(form), locationId, requestKey: crypto.randomUUID() };
        await createSchedule(api, creation.current);
      }
      creation.current = null;
      setUncertain(false);
      setEditing(undefined);
      setNotice(text.saved);
      await schedules.refresh();
    } catch (error) {
      setError(errorMessage(error));
      if (creation.current) {
        const knownRejection =
          axios.isAxiosError(error) && error.response && error.response.status < 500;
        if (knownRejection && !uncertain) creation.current = null;
        else setUncertain(true);
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (!editing || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      setEditing(await readSchedule(api, editing.id));
      setError('');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function more() {
    if (schedules.data?.nextCursor)
      await schedules.append(
        () => readSchedules(api, locationId, schedules.data!.nextCursor!),
        (current, page) => ({ ...page, schedules: [...current.schedules, ...page.schedules] }),
      );
  }
  return { schedules, editing, edit, save, reload, more, busy, uncertain, error, notice };
}
