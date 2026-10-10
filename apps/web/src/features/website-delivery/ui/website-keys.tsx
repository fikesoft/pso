import { Badge, Button } from '@pos/ui';
import { websiteDeliveryMessages as text } from '@pos/ui/locales';
import { websiteDate } from '../lib/website-presentation';
import type { WebsiteKeysProps } from '../model/website-delivery.types';
export function WebsiteKeys({ connection, model }: WebsiteKeysProps) {
  return (
    <section className="website-keys" aria-label={`${text.keys} · ${connection.name}`}>
      <h4>{text.keys}</h4>
      {!connection.keys.length && <p>{text.noKeys}</p>}
      {connection.keys.map((key) => {
        const expired = new Date(key.expiresAt).getTime() <= Date.now();
        return (
          <article key={key.id} className="website-key">
            <div className="operation-card-heading">
              <strong>{key.name}</strong>
              <Badge tone={key.revokedAt || expired ? 'neutral' : 'success'}>
                {key.revokedAt ? text.keyRevoked : expired ? text.keyExpired : text.keyActive}
              </Badge>
            </div>
            <p>
              {text.expiresAt}: {websiteDate(key.expiresAt)}
            </p>
            <p className="website-reference">
              {text.keyId}: {key.id}
            </p>
            {!key.revokedAt && (
              <Button
                variant="danger"
                disabled={model.busy}
                onClick={() => model.open({ kind: 'revoke', key })}
              >
                {text.revoke}
              </Button>
            )}
          </article>
        );
      })}
    </section>
  );
}
