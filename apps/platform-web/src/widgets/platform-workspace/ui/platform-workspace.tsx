import { PlatformSummary } from './platform-summary';
import { Button, Notice, PageTitle, Plus, ShieldCheck, roMessages } from '@pos/ui';
import { OrganizationList, useOrganizations } from '../../../entities/organization';
import {
  useProvisionOrganization,
  ProvisionOrganizationModal,
  ProvisionedCredentialNotice,
} from '../../../features/provision-organization';
import type { PlatformWorkspaceProps } from '../model/platform-workspace.types';
import { PlatformShell } from './platform-shell';
export function PlatformWorkspace({ session, api, logout }: PlatformWorkspaceProps) {
  const organizations = useOrganizations(api);
  const provisioning = useProvisionOrganization({ api, onCreated: organizations.load });
  return (
    <PlatformShell session={session} logout={logout}>
      <main className="main-content">
        <PageTitle
          eyebrow={roMessages.message437}
          title={roMessages.message332}
          description={roMessages.message341}
        >
          <Button onClick={provisioning.start}>
            <Plus size={16} />
            {roMessages.message342}
          </Button>
        </PageTitle>
        {organizations.error && <Notice>{organizations.error}</Notice>}
        {provisioning.credential && (
          <ProvisionedCredentialNotice
            credential={provisioning.credential}
            onDismiss={provisioning.dismissCredential}
          />
        )}
        <PlatformSummary count={organizations.organizations.length} />
        <OrganizationList
          organizations={organizations.organizations}
          loading={organizations.loading}
          query={organizations.query}
          onQueryChange={organizations.setQuery}
        />
        <p className="section-note">
          <ShieldCheck size={13} />
          {roMessages.message367}
        </p>
      </main>
      <ProvisionOrganizationModal controller={provisioning} />
    </PlatformShell>
  );
}
