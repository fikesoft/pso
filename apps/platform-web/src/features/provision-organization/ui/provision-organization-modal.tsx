import { Button, Field, Modal, Notice, roMessages } from '@pos/ui';
import { MINIMUM_PASSWORD_LENGTH } from '../../../shared/config/platform.constants';
import type { ProvisionOrganizationModalProps } from '../model/provision-organization.types';
export function ProvisionOrganizationModal({ controller }: ProvisionOrganizationModalProps) {
  const { open, setOpen, busy, error, create } = controller;
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={roMessages.message368}
      description={roMessages.message369}
    >
      <form className="form-stack" onSubmit={create}>
        {error && <Notice>{error}</Notice>}
        <div className="form-grid">
          <Field
            label={roMessages.message370}
            name="name"
            placeholder={roMessages.message371}
            required
            minLength={2}
          />
          <Field
            label={roMessages.message372}
            name="slug"
            placeholder={roMessages.message373}
            required
            minLength={2}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            hint={roMessages.message374}
          />
        </div>
        <Field label={roMessages.message375} name="legalName" />
        <div className="details-block">
          <h3>{roMessages.message194}</h3>
          <p className="text-small">{roMessages.message376}</p>
          <div className="form-stack">
            <Field label={roMessages.message377} name="adminDisplayName" required minLength={2} />
            <Field
              label={roMessages.message378}
              name="adminLogin"
              required
              minLength={3}
              pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]*"
            />
            <Field
              label={roMessages.message131}
              name="password"
              type="password"
              minLength={MINIMUM_PASSWORD_LENGTH}
              autoComplete="new-password"
              hint={roMessages.message132}
            />
          </div>
        </div>
        <div className="form-footer">
          <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
            {roMessages.message321}
          </Button>
          <Button type="submit" busy={busy}>
            {roMessages.message379}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
