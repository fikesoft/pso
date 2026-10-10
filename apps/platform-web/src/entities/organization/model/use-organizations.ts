import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import type { Organization } from '@pos/ui/types';
import type { PlatformApi } from '../../../shared/model/api.types';
import { fetchOrganizations } from '../api/organization.api';
export function useOrganizations(api: PlatformApi) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOrganizations(await fetchOrganizations(api));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  return { organizations, loading, error, query, setQuery, load };
}
