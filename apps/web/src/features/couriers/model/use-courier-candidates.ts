import { useCallback } from 'react';
import type { Api } from '../../../shared/api';
import { useRemoteData } from '../../../shared/lib';
import { readCourierCandidates } from '../../../entities/courier';
export function useCourierCandidates(api: Api, locationId: string, enabled: boolean) {
  const load = useCallback(
    () => (enabled ? readCourierCandidates(api, locationId) : Promise.resolve(null)),
    [api, locationId, enabled],
  );
  const result = useRemoteData(load);
  async function more() {
    const cursor = result.data?.nextCursor;
    if (cursor)
      await result.append(
        () => readCourierCandidates(api, locationId, cursor),
        (current, next) => ({
          ...next,
          candidates: [
            ...(current?.candidates ?? []).filter(
              (old) => !next.candidates.some((value) => value.userId === old.userId),
            ),
            ...next.candidates,
          ],
        }),
      );
  }
  return { ...result, more };
}
