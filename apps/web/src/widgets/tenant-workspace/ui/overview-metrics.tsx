import { roMessages, ShieldCheck, Building2, MapPin } from '@pos/ui';
import type { WorkspaceComponentProps } from '../model/workspace.types';
import { active } from '../lib/presentation';
export function OverviewMetrics({ model }: WorkspaceComponentProps) {
  const { actor, locations } = model;
  return (
    <div className="cards-grid">
      <div className="metric-card">
        <div className="metric-top">
          {roMessages.message175}
          <span className="metric-icon">
            <MapPin size={17} />
          </span>
        </div>
        <div className="metric-number">{locations.length.toString().padStart(2, '0')}</div>
        <div className="metric-foot">
          <span className="status-dot" />
          {locations.filter((l) => active(l.status)).length} {roMessages.message176}
        </div>
      </div>
      <div className="metric-card">
        <div className="metric-top">
          {roMessages.message177}
          <span className="metric-icon">
            <Building2 size={17} />
          </span>
        </div>
        <div className="metric-number">01</div>
        <div className="metric-foot">{roMessages.message178}</div>
      </div>
      <div className="metric-card">
        <div className="metric-top">
          {roMessages.message179}
          <span className="metric-icon">
            <ShieldCheck size={17} />
          </span>
        </div>
        <div className="metric-number" style={{ fontSize: 23, marginTop: 18 }}>
          {roMessages.message107}
        </div>
        <div className="metric-foot">
          {actor.mfaRequired ? roMessages.message180 : roMessages.message181}
        </div>
      </div>
    </div>
  );
}
