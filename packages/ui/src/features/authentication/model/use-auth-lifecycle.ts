import { useEffect, useMemo, useRef } from 'react';

/** Only the latest mounted request may update identity or temporary MFA material. */
export function useAuthLifecycle() {
  const state = useRef({ active: true, revision: 0, mutation: false });
  useEffect(() => {
    state.current.active = true;
    return () => {
      state.current.active = false;
      state.current.revision += 1;
      state.current.mutation = false;
    };
  }, []);
  return useMemo(
    () => ({
      beginRead() {
        if (!state.current.active || state.current.mutation) return null;
        return ++state.current.revision;
      },
      beginAction() {
        if (!state.current.active || state.current.mutation) return null;
        state.current.mutation = true;
        return ++state.current.revision;
      },
      invalidate() {
        state.current.mutation = true;
        return ++state.current.revision;
      },
      isCurrent(revision: number) {
        return state.current.active && state.current.revision === revision;
      },
      finishAction(revision: number) {
        if (state.current.revision === revision) state.current.mutation = false;
      },
    }),
    [],
  );
}
