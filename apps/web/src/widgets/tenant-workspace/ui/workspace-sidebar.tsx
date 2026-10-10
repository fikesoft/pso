import { roMessages, Building2, LogOut } from '@pos/ui';
import type { WorkspaceComponentProps } from '../model/workspace.types';
import { initials } from '../lib/presentation';
import { workspaceNavigation } from '../config/navigation.constants';
export function WorkspaceSidebar({ model }: WorkspaceComponentProps) {
  const { view, mobileOpen, setMobileOpen, canNavigate, navigate, exit, name, actor } = model;
  return (
    <>
      {mobileOpen && (
        <button
          aria-label={roMessages.message265}
          className="mobile-nav-backdrop"
          tabIndex={-1}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        ref={model.sidebarRef}
        className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}
      >
        <a href="/" className="brand">
          <span className="brand-mark">
            <Building2 size={20} />
          </span>
          {roMessages.message047}
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">{initials(name)}</span>
          <div>
            <strong>{name}</strong>
            <small>{roMessages.message266}</small>
          </div>
        </div>
        <div className="nav-label">{roMessages.message267}</div>
        <nav aria-label={roMessages.message268}>
          {workspaceNavigation
            .filter((n) => canNavigate(n.id, n.permission))
            .map((n) => (
              <button
                key={n.id}
                className={`nav-button ${view === n.id ? 'active' : ''}`}
                aria-current={view === n.id ? 'page' : undefined}
                onClick={() => navigate(n.id)}
              >
                <n.icon />
                {n.label}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <strong>
              <span className="status-dot" />
              {roMessages.message269}
            </strong>
            <p>
              {roMessages.message270}
              <br />
              {roMessages.message271}
            </p>
          </div>
          <div className="user-chip">
            <span className="avatar">{initials(actor.displayName)}</span>
            <div>
              <strong>{actor.displayName}</strong>
              <small>{actor.isPrimaryAdmin ? roMessages.message194 : roMessages.message272}</small>
            </div>
            <button
              className="icon-button"
              aria-label={roMessages.message273}
              onClick={() => void exit()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
