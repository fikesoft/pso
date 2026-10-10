import { useCallback, useRef, useState } from 'react';
import type { Api } from '../../../shared/api';
import { readKitchenStationOptions } from '../../../entities/kitchen';
import {
  useRemoteData,
  useInvalidation,
  useCoalescedInvalidation,
  isAccessRejection,
} from '../../../shared/lib';

export function useKitchenStationOptions(api: Api, locationId: string) {
  const desired = useRef({ api, locationId, depth: 1 });
  if (desired.current.api !== api || desired.current.locationId !== locationId)
    desired.current = { api, locationId, depth: 1 };
  const load = useCallback(async () => {
    const depth = desired.current.depth;
    const first = await readKitchenStationOptions(api, locationId);
    const stations = new Map(first.stations.map((station) => [station.id, station]));
    let cursor = first.nextCursor;
    for (let pageNumber = 1; cursor && pageNumber < depth; pageNumber++) {
      const page = await readKitchenStationOptions(api, locationId, cursor);
      for (const station of page.stations) stations.set(station.id, station);
      cursor = page.nextCursor;
    }
    return { stations: [...stations.values()], nextCursor: cursor };
  }, [api, locationId]);
  const list = useRemoteData(load);
  const signal = useInvalidation(`kitchen:${locationId}`);
  useCoalescedInvalidation(signal, () => list.revalidate(load, isAccessRejection));
  const pending = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  async function more() {
    if (!list.data?.nextCursor || pending.current) return;
    pending.current = true;
    setLoadingMore(true);
    desired.current.depth++;
    try {
      await list.revalidate(load, isAccessRejection);
    } finally {
      pending.current = false;
      setLoadingMore(false);
    }
  }
  return { ...list, loadingMore, more };
}
