import { useRef } from 'react';
import { Button } from '@pos/ui';
import { mediaMessages as text } from '@pos/ui/locales';
import type { MediaEditorControlsProps } from '../model/media.types';

export function MediaFileField({ model, resource }: MediaEditorControlsProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="form-stack">
      <input
        key={resource.version}
        ref={input}
        hidden
        aria-label={text.file}
        name="image"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={model.locked}
        onChange={(event) => model.chooseFile(event.currentTarget.files?.[0] ?? null)}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={model.locked}
        onClick={() => input.current?.click()}
      >
        {text.file}
      </Button>
      <span className="media-file-name muted text-small" aria-live="polite">
        {model.file?.name ?? text.noFile}
      </span>
    </div>
  );
}
