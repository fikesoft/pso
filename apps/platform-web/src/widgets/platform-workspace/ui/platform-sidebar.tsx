import { PLATFORM_NAVIGATION_ID } from '../../../shared/config/platform.constants';
import { Building2, ShieldCheck, LockKeyhole, LogOut, roMessages } from '@pos/ui';
import type { PlatformSidebarProps } from '../model/platform-workspace.types';
export function PlatformSidebar({
  session,
  logout,
  mobileOpen,
  navigationRef,
  closeNavigation,
}: PlatformSidebarProps) {
  return (
    <aside
      id={PLATFORM_NAVIGATION_ID}
      ref={navigationRef}
      className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}
    >
      <a className="brand" href="/">
        <span className="brand-mark">
          <Building2 size={20} />
        </span>
        {roMessages.message047}
        <span className="brand-dot">.</span>
      </a>
      <div className="workspace-switch">
        <span className="workspace-avatar">
          <ShieldCheck size={18} />
        </span>
        <div>
          <strong>{roMessages.message329}</strong>
          <small>{roMessages.message330}</small>
        </div>
      </div>
      <div className="nav-label">{roMessages.message331}</div>
      <nav>
        <button className="nav-button active" onClick={closeNavigation} aria-current="page">
          <Building2 />
          {roMessages.message332}
        </button>
      </nav>
      <div className="sidebar-bottom">
        <div className="local-card">
          <strong>
            <LockKeyhole size={13} />
            {roMessages.message333}
          </strong>
          <p>
            {roMessages.message334}
            <br />
            {roMessages.message335}
          </p>
        </div>
        <div className="user-chip">
          <span className="avatar">{roMessages.message336}</span>
          <div>
            <strong>{session.user?.displayName}</strong>
            <small>{roMessages.message337}</small>
          </div>
          <button
            className="icon-button"
            aria-label={roMessages.message273}
            onClick={() => void logout()}
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
