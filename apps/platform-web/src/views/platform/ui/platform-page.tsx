'use client';
import { AuthGate } from '@pos/ui/auth';
import { PlatformWorkspace } from '../../../widgets/platform-workspace';
export function PlatformPage() {
  return (
    <AuthGate plane="platform">
      {(session, api, logout) => <PlatformWorkspace session={session} api={api} logout={logout} />}
    </AuthGate>
  );
}
