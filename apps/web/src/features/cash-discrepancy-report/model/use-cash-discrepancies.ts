import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CashDiscrepancyQuery,
  CashDiscrepancyResponse,
} from '@pos/contracts/cash-discrepancies';
import { errorMessage } from '@pos/ui/api';
import { cashDiscrepancyMessages as text } from '@pos/ui/locales';
import { readCashDiscrepancies } from '../../../entities/cash-shift';
import { isAccessRejection } from '../../../shared/lib';
import { discrepancyQuery } from '../lib/discrepancy-query';
import { emptyDiscrepancyFields } from '../config/discrepancy.constants';
import { useDiscrepancyRegisters } from './use-discrepancy-registers';
import type { CashDiscrepancyProps, DiscrepancyFields } from './cash-discrepancy.types';
export function useCashDiscrepancies(props: CashDiscrepancyProps) {
  const [fields, setFields] = useState<DiscrepancyFields>(emptyDiscrepancyFields);
  const [query, setQuery] = useState<CashDiscrepancyQuery | null>(null);
  const [validation, setValidation] = useState('');
  const [data, setData] = useState<CashDiscrepancyResponse | null>(null);
  const [dataKey, setDataKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const epoch = useRef(0);
  const [denied, setDenied] = useState(false);
  const deny = useCallback(() => {
    epoch.current++;
    setData(null);
    setLoading(false);
    setDenied(true);
  }, []);
  const key = JSON.stringify([
    props.organizationId,
    props.actorUserId,
    props.locationId,
    props.allowed,
    denied,
    query,
  ]);
  const current = useRef(key);
  current.current = key;
  const optionsQuery = useMemo(
    () =>
      query
        ? {
            locationId: query.locationId,
            closedFrom: query.closedFrom,
            closedTo: query.closedTo,
            discrepancy: query.discrepancy,
            limit: 50,
          }
        : null,
    [query?.locationId, query?.closedFrom, query?.closedTo, query?.discrepancy],
  );
  const registers = useDiscrepancyRegisters(
    { ...props, allowed: props.allowed && !denied },
    optionsQuery,
    deny,
  );
  const load = useCallback(
    async (cursor?: string) => {
      const version = ++epoch.current;
      setError('');
      if (!cursor) setData(null);
      if (!query || !props.allowed || denied || query.locationId !== props.locationId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await readCashDiscrepancies(props.api, {
          ...query,
          ...(cursor ? { cursor } : {}),
        });
        if (version !== epoch.current || current.current !== key) return;
        setData((previous) => ({
          ...result,
          closings:
            cursor && previous
              ? [
                  ...previous.closings.filter(
                    (old) => !result.closings.some((row) => row.closing.id === old.closing.id),
                  ),
                  ...result.closings,
                ]
              : result.closings,
        }));
        setDataKey(key);
      } catch (failure) {
        if (version === epoch.current && current.current === key) {
          if (isAccessRejection(failure)) {
            registers.invalidate();
            deny();
          }
          setError(errorMessage(failure));
        }
      } finally {
        if (version === epoch.current && current.current === key) setLoading(false);
      }
    },
    [props.api, props.allowed, props.locationId, query, key, denied, deny],
  );
  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
    };
  }, [load]);
  const visible = props.allowed && !denied && dataKey === key ? data : null;
  return {
    denied,
    fields,
    setFields,
    query,
    validation,
    data: visible,
    error,
    loading,
    registers,
    apply: () => {
      const parsed = discrepancyQuery(props.locationId, fields);
      if (!parsed.success) {
        setValidation(text.invalid);
        return;
      }
      setValidation('');
      setDenied(false);
      setQuery(parsed.data);
    },
    reset: () => {
      setFields(emptyDiscrepancyFields);
      setQuery(null);
      setValidation('');
    },
    refresh: () => {
      if (denied) {
        setDenied(false);
        return Promise.resolve();
      }
      return load();
    },
    more: () => (!loading && visible?.nextCursor ? load(visible.nextCursor) : Promise.resolve()),
  };
}
