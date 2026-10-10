import { roMessages, Select, ShieldCheck, Breadcrumb, Menu } from '@pos/ui';
import type { WorkspaceComponentProps } from '../model/workspace.types';
import { workspaceTitles } from '../config/navigation.constants';
export function WorkspaceHeader({ model }: WorkspaceComponentProps) {
  const {
    view,
    locationId,
    online,
    setMobileOpen,
    changeLocation,
    name,
    actor,
    locations,
    locationName,
  } = model;
  return (
    <>
      <header className="topbar">
        <button
          className="icon-button mobile-menu"
          ref={model.menuButtonRef}
          aria-expanded={model.mobileOpen}
          aria-controls="workspace-navigation"
          aria-label={roMessages.message274}
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={21} />
        </button>
        <Breadcrumb>{workspaceTitles[view]}</Breadcrumb>
        <div className="topbar-right">
          <Select
            label={roMessages.message275}
            value={locationId}
            onChange={(e) => changeLocation(e.target.value)}
          >
            <option value="">
              {roMessages.message276} {name}
            </option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <span className="topbar-private">
            <ShieldCheck size={14} />
            <span className="desktop-label">{roMessages.message277}</span>
          </span>
        </div>
      </header>
      <div className="mobile-context">
        <strong>{name}</strong>
        <span>
          {actor.displayName} · {locationId ? locationName(locationId) : roMessages.message087}
        </span>
      </div>
      {!online && (
        <div className="status-banner" role="alert">
          {roMessages.message278}
        </div>
      )}
    </>
  );
}
