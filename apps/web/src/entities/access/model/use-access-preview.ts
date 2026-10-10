import type { AccessEntry } from '@pos/ui/types';
import { useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import type { AccessPreviewProps } from './access-preview.types';
import { previewAccess } from '../api/preview-access';
export function useAccessPreview({
  api,
  scope,
  locationId,
  userId,
  permissions,
  effect,
  onPreview,
}: AccessPreviewProps) {
  const [entries, setEntries] = useState<AccessEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function preview() {
    setBusy(true);
    setError('');
    try {
      const data = await previewAccess(api, {
        ...(userId ? { userId } : {}),
        scopeType: scope,
        ...(scope === 'LOCATION' ? { locationId } : {}),
        ...(permissions ? { permissions } : {}),
        ...(effect ? { effect } : {}),
      });
      setEntries(data.entries);
      onPreview?.(data.entries);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { entries, busy, error, preview };
}
