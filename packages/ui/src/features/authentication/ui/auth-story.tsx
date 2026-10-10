import { Building2, KeyRound, ShieldCheck } from 'lucide-react';
import { roMessages } from '../../../shared/i18n';
import type { AuthStoryProps } from '../model/authentication.types';
export function AuthStory({ plane }: AuthStoryProps) {
  return (
    <section className="auth-story">
      <a className="brand" href="/">
        <span className="brand-mark">
          <Building2 size={22} />
        </span>
        {roMessages.message047}
        <span className="brand-dot">.</span>
        <span className="brand-caption">
          {plane === 'platform' ? roMessages.message381 : roMessages.message382}
        </span>
      </a>
      <div className="auth-story-content">
        <span className="eyebrow">
          {plane === 'platform' ? roMessages.message383 : roMessages.message384}
        </span>
        <h1>
          {plane === 'platform' ? (
            <>
              {roMessages.message385}
              <br />
              {roMessages.message386}
            </>
          ) : (
            <>
              {roMessages.message387}
              <br />
              {roMessages.message388}
            </>
          )}
        </h1>
        <p>{plane === 'platform' ? roMessages.message389 : roMessages.message390}</p>
        <div className="auth-principles">
          <div>
            <ShieldCheck size={21} />
            <span>{roMessages.message391}</span>
          </div>
          <div>
            <Building2 size={21} />
            <span>{roMessages.message392}</span>
          </div>
          <div>
            <KeyRound size={21} />
            <span>{roMessages.message393}</span>
          </div>
        </div>
      </div>
      <div className="auth-foot">
        {roMessages.message394} <span className="status-dot" />
      </div>
    </section>
  );
}
