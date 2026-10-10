import { useState } from 'react';
import { Button, Field, Notice } from '@pos/ui';
import { kitchenAlertMessages as text } from '@pos/ui/locales';
import { kitchenAlertThresholdsSchema } from '@pos/contracts/kitchen-alerts';
import type { AlertFormProps } from '../model/alert.types';
import { AlertSource } from './alert-source';

export function AlertForm({ rule, preview, operation }: AlertFormProps) {
  const initial = rule.thresholds ?? preview.effective.thresholds;
  const [warning, setWarning] = useState(String(initial.warningSeconds));
  const [critical, setCritical] = useState(String(initial.criticalSeconds));
  const [error, setError] = useState('');
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = kitchenAlertThresholdsSchema.safeParse({
          warningSeconds: Number(warning),
          criticalSeconds: Number(critical),
        });
        if (!parsed.success) {
          setError(text.invalidThresholds);
          return;
        }
        setError('');
        void operation.send({
          scope: rule.scope,
          target: rule.target,
          version: rule.version,
          requestKey: crypto.randomUUID(),
          thresholds: parsed.data,
        });
      }}
    >
      <AlertSource label={text.effective} value={preview.effective} />
      <AlertSource label={text.inherited} value={preview.inherited} />
      <p className="muted">{text.previewHint}</p>
      <Field
        label={text.warningSeconds}
        type="number"
        min="1"
        max="86399"
        step="1"
        required
        value={warning}
        disabled={operation.locked}
        onChange={(event) => setWarning(event.target.value)}
      />
      <Field
        label={text.criticalSeconds}
        type="number"
        min="2"
        max="86400"
        step="1"
        required
        value={critical}
        disabled={operation.locked}
        onChange={(event) => setCritical(event.target.value)}
      />
      {error && <Notice>{error}</Notice>}
      <div className="inline">
        <Button type="submit" disabled={operation.locked}>
          {text.save}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={operation.locked || rule.thresholds === null}
          onClick={() =>
            void operation.send({
              scope: rule.scope,
              target: rule.target,
              version: rule.version,
              requestKey: crypto.randomUUID(),
              thresholds: null,
            })
          }
        >
          {text.inherit}
        </Button>
      </div>
    </form>
  );
}
