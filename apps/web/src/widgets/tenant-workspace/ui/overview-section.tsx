import {
  roMessages,
  pinMessages,
  formatMessage,
  Button,
  Check,
  Badge,
  ShieldCheck,
  Empty,
  PageTitle,
  MapPin,
  ArrowUpRight,
  RefreshCw,
  LockKeyhole,
} from '@pos/ui';
import { errorMessage } from '@pos/ui/api';
import type { WorkspaceComponentProps } from '../model/workspace.types';
import { active } from '../lib/presentation';
import { OverviewMetrics } from './overview-metrics';
import { OverviewDemoLinks } from './overview-demo-links';
import { SessionManagement } from '../../../features/session-management';
import { WorkspaceEmployeeProfile } from './workspace-employee-profile';
export function OverviewSection({ model }: WorkspaceComponentProps) {
  const { loadContext, setError, can, navigate, changeLocation, actor, locations } = model;
  return (
    <>
      <PageTitle
        eyebrow={roMessages.message434}
        title={formatMessage(roMessages.message172, actor.displayName.split(' ')[0])}
        description={roMessages.message173}
      >
        <Button
          variant="secondary"
          onClick={() => void loadContext().catch((e) => setError(errorMessage(e)))}
        >
          <RefreshCw size={15} />
          {roMessages.message174}
        </Button>
      </PageTitle>
      <OverviewMetrics model={model} />
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>{roMessages.message182}</h2>
              <p>{roMessages.message183}</p>
            </div>
            {can('locations.read') && (
              <Button variant="ghost" onClick={() => navigate('locations')}>
                {roMessages.message184}
                <ArrowUpRight size={14} />
              </Button>
            )}
          </div>
          {!locations.length ? (
            <Empty title={roMessages.message185} description={roMessages.message186} />
          ) : (
            locations.map((l) => (
              <div className="mini-location" key={l.id}>
                <span className="workspace-avatar">
                  <MapPin size={18} />
                </span>
                <div>
                  <strong>{l.name}</strong>
                  <p>{l.address || formatMessage(roMessages.message187, l.code)}</p>
                </div>
                <Badge tone={active(l.status) ? 'success' : 'neutral'}>
                  {active(l.status) ? roMessages.message107 : roMessages.message108}
                </Badge>
                <button
                  className="icon-button"
                  aria-label={formatMessage(roMessages.message188, l.name)}
                  onClick={() => changeLocation(l.id)}
                >
                  <ArrowUpRight size={16} />
                </button>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>{roMessages.message189}</h2>
              <p>{roMessages.message190}</p>
            </div>
            <ShieldCheck size={18} color="#668b75" />
          </div>
          <div className="panel-body">
            <div className="check-row">
              <Check size={16} />
              <span>
                {actor.authenticationMethod === 'PIN'
                  ? pinMessages.pinConfigured
                  : roMessages.message191}
              </span>
            </div>
            <div className="check-row">
              <Check size={16} />
              <span>{actor.mfaEnrolled ? roMessages.message192 : roMessages.message193}</span>
            </div>
            <div className="check-row">
              <LockKeyhole size={16} />
              <span>{actor.isPrimaryAdmin ? roMessages.message194 : roMessages.message195}</span>
            </div>
            <Button
              variant="secondary"
              className="full-width"
              style={{ marginTop: 18 }}
              onClick={() => navigate('access')}
            >
              {roMessages.message196}
              <ArrowUpRight size={14} />
            </Button>
          </div>
        </section>
      </div>
      <section className="panel">
        <SessionManagement
          api={model.api}
          userId={actor.id}
          currentUserId={actor.id}
          onCurrentSessionRevoked={model.revokedExit}
        />
      </section>
      <OverviewDemoLinks /> <WorkspaceEmployeeProfile model={model} userId={actor.id} editable />
    </>
  );
}
