import { roMessages, Check, X, Badge } from '@pos/ui';
import type { AccessMatrixProps } from '../model/access-matrix.types';
export function AccessMatrix({ entries, proposed }: AccessMatrixProps) {
  return (
    <div className={`access-table ${proposed ? 'with-proposal' : ''}`}>
      <div className="access-row">
        <span>{roMessages.message093}</span>
        <span>
          {roMessages.message094}
          {proposed ? roMessages.message095 : ''}
        </span>
        {proposed && <span>{roMessages.message096}</span>}
        <span>{roMessages.message097}</span>
      </div>
      {entries.map((entry) => (
        <div className="access-row" key={entry.permission}>
          <span>
            {entry.label || entry.permission}
            {entry.source && (
              <small>
                {Array.isArray(entry.source)
                  ? entry.source.join(' · ')
                  : typeof entry.source === 'string'
                    ? entry.source
                    : JSON.stringify(entry.source)}
              </small>
            )}
          </span>
          <span className={entry.canUse ? 'access-check' : 'access-no'}>
            {entry.canUse ? <Check size={14} /> : <X size={14} />}{' '}
            {entry.canUse ? roMessages.message098 : roMessages.message099}
          </span>
          {proposed && (
            <span className={entry.proposedCanUse ? 'access-check' : 'access-no'}>
              {entry.proposedCanUse ? <Check size={14} /> : <X size={14} />}{' '}
              {entry.proposedCanUse ? roMessages.message098 : roMessages.message099}
            </span>
          )}
          <span className={entry.canGrant ? 'access-check' : 'access-no'}>
            {entry.canGrant ? <Check size={14} /> : <X size={14} />}{' '}
            {entry.canGrant ? roMessages.message098 : roMessages.message099}
          </span>
        </div>
      ))}
      {!entries.length && (
        <div className="panel-body">
          <Badge>{roMessages.message100}</Badge>
        </div>
      )}
    </div>
  );
}
