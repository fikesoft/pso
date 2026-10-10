import { useCallback, useEffect, useRef, useState } from 'react';
import { listBillSplits, readBillSplit, useBillOperation } from '../../../entities/bill-split';
import { useRemoteData } from '../../../shared/lib';
import type { BillServiceProps } from './bill-service.types';
export function useBillService(props: BillServiceProps) {
  const { api, locationId, context } = props;
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [partId, setPartId] = useState<string>();
  const peer = useRef({ plan: false, collection: false });
  const list = useRemoteData(
    useCallback(
      () =>
        context
          ? listBillSplits(api, { locationId, contextKind: context.kind, contextId: context.id })
          : Promise.resolve({ splits: [], nextCursor: null }),
      [api, locationId, context?.kind, context?.id],
    ),
  );
  const detail = useRemoteData(
    useCallback(
      () => (selectedId ? readBillSplit(api, locationId, selectedId) : Promise.resolve(null)),
      [api, locationId, selectedId],
    ),
  );
  const plan = useBillOperation({
    ...props,
    family: 'PLAN',
    isExternallyBlocked: () => props.blocked || peer.current.collection,
    onSaved: async (result) => {
      setCreating(false);
      if (result?.family === 'PLAN') {
        setSelectedId(result.result.split.id);
        detail.setData(result.result.split);
      }
      await list.refresh();
      props.onUpdated();
    },
  });
  const collection = useBillOperation({
    ...props,
    family: 'COLLECTION',
    isExternallyBlocked: () => props.blocked || peer.current.plan,
    onSaved: async () => {
      setPartId(undefined);
      await detail.refresh();
      await list.refresh();
      props.onUpdated();
    },
  });
  peer.current = {
    plan: plan.busy || plan.recovering,
    collection: collection.busy || collection.recovering,
  };
  const pending = peer.current.plan || peer.current.collection;
  useEffect(() => {
    props.onLockedChange(pending);
  }, [pending, props.onLockedChange]);
  useEffect(() => {
    setSelectedId(undefined);
    setCreating(false);
    setPartId(undefined);
  }, [context?.kind, context?.id]);
  async function refresh() {
    setCreating(false);
    setPartId(undefined);
    const result = await list.refresh();
    const selected = selectedId ? await detail.refresh() : true;
    if (result && selected) {
      plan.refreshed();
      collection.refreshed();
    }
  }
  async function more() {
    if (!context || !list.data?.nextCursor) return;
    const cursor = list.data.nextCursor;
    await list.append(
      () =>
        listBillSplits(api, {
          locationId,
          contextKind: context.kind,
          contextId: context.id,
          cursor,
        }),
      (old, page) => ({
        ...page,
        splits: [
          ...old.splits.filter((row) => !page.splits.some((next) => next.id === row.id)),
          ...page.splits,
        ],
      }),
    );
  }
  return {
    list,
    detail,
    plan,
    collection,
    selectedId,
    setSelectedId,
    creating,
    setCreating,
    partId,
    setPartId,
    refresh,
    more,
    pending,
    locked: props.blocked || plan.locked || collection.locked,
  };
}
