import { Button, ArrowUpRight, roMessages } from '@pos/ui';
import { tenantLoginUrl } from '../../../shared/lib/tenant-login-url';
import type { ProvisionedCredentialProps } from '../model/provision-organization.types';
export function ProvisionedCredentialNotice({ credential, onDismiss }: ProvisionedCredentialProps) {
  return (
    <div className="credential">
      <strong>{roMessages.message343}</strong>
      <div>
        {roMessages.message344} <b>{credential.slug}</b> {roMessages.message345}{' '}
        <b>{credential.login}</b>
      </div>
      <code>{credential.password}</code>
      <p>{roMessages.message346}</p>
      <div className="inline">
        <Button variant="secondary" onClick={onDismiss}>
          {roMessages.message103}
        </Button>
        <a href={tenantLoginUrl(credential.slug)} className="button button-ghost">
          {roMessages.message347}
          <ArrowUpRight size={14} />
        </a>
      </div>
    </div>
  );
}
