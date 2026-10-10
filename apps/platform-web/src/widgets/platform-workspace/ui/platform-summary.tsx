import { Building2, ShieldCheck, LockKeyhole, roMessages } from '@pos/ui';
import type { PlatformSummaryProps } from '../model/platform-workspace.types';
export function PlatformSummary({ count }: PlatformSummaryProps) {
  return (
    <div className="cards-grid">
      <div className="metric-card">
        <div className="metric-top">
          {roMessages.message348}
          <span className="metric-icon">
            <Building2 size={17} />
          </span>
        </div>
        <div className="metric-number">{count.toString().padStart(2, '0')}</div>
        <div className="metric-foot">{roMessages.message349}</div>
      </div>
      <div className="metric-card">
        <div className="metric-top">
          {roMessages.message350}
          <span className="metric-icon">
            <ShieldCheck size={17} />
          </span>
        </div>
        <div className="metric-number metric-number-label">{roMessages.message351}</div>
        <div className="metric-foot">{roMessages.message352}</div>
      </div>
      <div className="metric-card">
        <div className="metric-top">
          {roMessages.message353}
          <span className="metric-icon">
            <LockKeyhole size={17} />
          </span>
        </div>
        <div className="metric-number metric-number-label">{roMessages.message354}</div>
        <div className="metric-foot">{roMessages.message355}</div>
      </div>
    </div>
  );
}
