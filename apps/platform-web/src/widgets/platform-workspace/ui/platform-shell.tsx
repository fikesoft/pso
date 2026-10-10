import { usePlatformNavigation } from '../model/use-platform-navigation';
import { roMessages } from '@pos/ui';
import type { PlatformShellProps } from '../model/platform-workspace.types';
import { PlatformSidebar } from './platform-sidebar';
import { PlatformTopbar } from './platform-topbar';
export function PlatformShell({ session, logout, children }: PlatformShellProps) {
  const { mobileOpen, navigationRef, closeNavigation, openNavigation } = usePlatformNavigation();
  return (
    <div className="app-shell platform-shell">
      {mobileOpen && (
        <button
          className="mobile-nav-backdrop"
          aria-label={roMessages.message265}
          onClick={closeNavigation}
          tabIndex={-1}
        />
      )}
      <PlatformSidebar
        session={session}
        logout={logout}
        mobileOpen={mobileOpen}
        navigationRef={navigationRef}
        closeNavigation={closeNavigation}
      />
      <div className="main-area" inert={mobileOpen}>
        <PlatformTopbar session={session} mobileOpen={mobileOpen} openNavigation={openNavigation} />
        {children}
      </div>
    </div>
  );
}
