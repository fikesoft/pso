'use client';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { AuthGate } from '@pos/ui/auth';
import { makeStore } from '../../../entities/workspace';
import { Workspace } from '../../../widgets/tenant-workspace';
import type { TenantAppProps } from '../model/tenant-app.types';
export function TenantApp({ companySlug }: TenantAppProps) {
  const [store] = useState(makeStore);
  return (
    <Provider store={store}>
      <AuthGate plane="tenant" companySlug={companySlug}>
        {(session, api, logout, invalidateRevoked) => (
          <Workspace
            session={session}
            api={api}
            logout={logout}
            invalidateRevoked={invalidateRevoked}
          />
        )}
      </AuthGate>
    </Provider>
  );
}
