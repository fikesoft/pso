import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { sessionMessages as text } from '@pos/ui/locales';
import { useRemoteData } from '../../../shared/lib';
import { readSessions, revokeAllSessions, revokeSession } from '../api/sessions.api';
import type { RevocationTarget, SessionManagementProps } from './session-management.types';

export function useSessionManagement(props: SessionManagementProps) {
  const { api, userId, currentUserId, onCurrentSessionRevoked } = props;
  const load = useCallback(() => readSessions(api, userId), [api, userId]);
  const sessions = useRemoteData(load);
  const [target, setTarget] = useState<RevocationTarget>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (sessions.error) setTarget(null);
  }, [sessions.error]);
  async function more() {
    const cursor = sessions.data?.nextCursor;
    if (cursor)
      await sessions.append(
        () => readSessions(api, userId, cursor),
        (current, next) => ({ ...next, sessions: [...current.sessions, ...next.sessions] }),
      );
  }
  async function confirm() {
    if (!target || busy) return;
    setBusy(true);
    setActionError('');
    try {
      const result =
        target === 'all'
          ? await revokeAllSessions(api, userId)
          : await revokeSession(api, target.id);
      setTarget(null);
      if (result.currentRevoked) {
        await onCurrentSessionRevoked();
        return;
      }
      setNotice(target === 'all' ? text.allRevoked : text.revoked);
      await sessions.refresh();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return {
    ...props,
    sessions,
    target,
    setTarget,
    busy,
    actionError,
    notice,
    more,
    confirm,
    isOwn: userId === currentUserId,
  };
}
