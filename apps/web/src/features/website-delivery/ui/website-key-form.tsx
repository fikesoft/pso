import { useState } from 'react';
import { Button, Field, Modal, Notice } from '@pos/ui';
import { websiteDeliveryMessages as text } from '@pos/ui/locales';
import type { WebsiteKeyFormProps } from '../model/website-delivery.types';
import { WEBSITE_KEY_DEFAULT_DAYS } from '../config/website-delivery.constants';
export function WebsiteKeyForm({ model, connection }: WebsiteKeyFormProps) {
  const [name, setName] = useState('');
  const [days, setDays] = useState(WEBSITE_KEY_DEFAULT_DAYS);
  return (
    <Modal
      open
      title={text.generateTitle}
      description={`${connection.name} · ${connection.locationName}`}
      onOpenChange={(open) => {
        if (!open && !model.busy) model.setDialog(null);
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void model.issue(connection.id, { name: name.trim(), expiresInDays: parseInt(days, 10) });
        }}
      >
        {model.error && <Notice>{model.error}</Notice>}
        <Notice tone="info">{text.oneTimeHint}</Notice>
        <fieldset disabled={model.busy} className="website-form-fields">
          <Field
            label={text.keyName}
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Field
            label={text.expiresInDays}
            hint={text.expiryHint}
            type="number"
            required
            min={1}
            max={90}
            step={1}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </fieldset>
        <div className="form-footer">
          <Button type="submit" busy={model.busy}>
            {text.generate}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
