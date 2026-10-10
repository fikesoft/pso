import { PLATFORM_NAVIGATION_ID } from '../../../shared/config/platform.constants';
import { Breadcrumb, LockKeyhole, Menu, roMessages } from '@pos/ui';
import type { PlatformTopbarProps } from '../model/platform-workspace.types';
export function PlatformTopbar({ session, mobileOpen, openNavigation }: PlatformTopbarProps) {
  return (
    <>
      <header className="topbar">
        <button
          className="icon-button mobile-menu"
          aria-label={roMessages.message274}
          aria-controls={PLATFORM_NAVIGATION_ID}
          aria-expanded={mobileOpen}
          onClick={openNavigation}
        >
          <Menu size={21} />
        </button>
        <Breadcrumb>{roMessages.message332}</Breadcrumb>
        <span className="topbar-private">
          <LockKeyhole size={14} />
          {roMessages.message338}
        </span>
      </header>
      <div className="mobile-context">
        <strong>{roMessages.message339}</strong>
        <span>
          {session.user?.displayName} {roMessages.message340}
        </span>
      </div>
    </>
  );
}
