import { useState } from 'react';
import { Button, Field, Modal, Notice, Select } from '@pos/ui';
import { websiteDeliveryMessages as text } from '@pos/ui/locales';
import type { WebsiteConnectionFormProps } from '../model/website-delivery.types';
export function WebsiteConnectionForm({
  model,
  locations,
  locationId,
}: WebsiteConnectionFormProps) {
  const [name, setName] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(locationId);
  return (
    <Modal
      open
      title={text.newConnection}
      description={text.connectionsHint}
      onOpenChange={(open) => {
        if (!open && !model.busy) model.setDialog(null);
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void model.create({ name: name.trim(), locationId: selectedLocation });
        }}
      >
        {model.error && <Notice>{model.error}</Notice>}
        <fieldset disabled={model.busy} className="website-form-fields">
          <Field
            label={text.connectionName}
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Select
            label={text.connectionLocation}
            required
            value={selectedLocation}
            onChange={(event) => setSelectedLocation(event.target.value)}
          >
            <option value="">{text.chooseLocation}</option>
            {locations
              .filter((location) => location.status === 'ACTIVE')
              .map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
          </Select>
        </fieldset>
        <div className="form-footer">
          <Button type="submit" busy={model.busy}>
            {text.createConnection}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
