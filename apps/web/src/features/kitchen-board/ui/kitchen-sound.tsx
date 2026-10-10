import { Button, Notice } from '@pos/ui';
import { kitchenAlertMessages as text } from '@pos/ui/locales';
import { useKitchenSound } from '../model/use-kitchen-sound';
import type { KitchenSoundProps } from '../model/kitchen-board.types';

export function KitchenSound(props: KitchenSoundProps) {
  const model = useKitchenSound(props);
  return (
    <section className="form-stack" aria-label={text.soundTitle}>
      <p role="status">{model.enabled ? text.soundEnabled : text.soundDisabled}</p>
      <div className="form-footer">
        <Button
          variant="secondary"
          busy={model.busy}
          onClick={() => (model.enabled ? model.stop() : void model.enable())}
        >
          {model.enabled ? text.disableSound : text.enableSound}
        </Button>
        {model.enabled && (
          <Button variant="secondary" onClick={model.play}>
            {text.testSound}
          </Button>
        )}
      </div>
      <p className="scope-hint">{text.soundHint}</p>
      {model.error && <Notice>{model.error}</Notice>}
    </section>
  );
}
