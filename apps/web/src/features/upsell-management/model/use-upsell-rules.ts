import { useCallback, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import type { CreateUpsellRule, UpsellRuleDto } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { upsellMessages as text } from '@pos/ui/locales';
import { formText, useRemoteData } from '../../../shared/lib';
import { createRule, readRule, readRules, updateRule } from '../api/upsell-rules.api';
import type { UpsellManagementProps } from './upsell-management.types';

export function useUpsellRules({ api, locationId }: UpsellManagementProps) {
  const rules = useRemoteData(useCallback(() => readRules(api, locationId), [api, locationId]));
  const [editing, setEditing] = useState<UpsellRuleDto | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const creation = useRef<CreateUpsellRule | null>(null);
  function edit(rule: UpsellRuleDto | null | undefined) {
    if (pending.current || uncertain) return;
    creation.current = null;
    setError('');
    setEditing(rule);
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
      const fields = {
        name: formText(form, 'name'),
        sortOrder: Number(formText(form, 'sortOrder')),
      };
      if (editing)
        await updateRule(api, editing.id, {
          ...fields,
          version: editing.version,
          status: formText(form, 'status') as UpsellRuleDto['status'],
        });
      else {
        creation.current ??= {
          ...fields,
          locationId,
          requestKey: crypto.randomUUID(),
          sourceProductId: formText(form, 'sourceProductId'),
          targetProductId: formText(form, 'targetProductId'),
        };
        await createRule(api, creation.current);
      }
      creation.current = null;
      setUncertain(false);
      setEditing(undefined);
      setNotice(text.saved);
      await rules.refresh();
    } catch (error) {
      setError(errorMessage(error));
      if (creation.current) {
        const known = axios.isAxiosError(error) && error.response && error.response.status < 500;
        if (known && !uncertain) creation.current = null;
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
      setEditing(await readRule(api, editing.id));
      setError('');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function more() {
    if (rules.data?.nextCursor)
      await rules.append(
        () => readRules(api, locationId, rules.data!.nextCursor!),
        (current, page) => ({ ...page, rules: [...current.rules, ...page.rules] }),
      );
  }
  return { rules, editing, edit, save, reload, more, busy, uncertain, error, notice };
}
