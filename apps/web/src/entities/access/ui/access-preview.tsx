import { roMessages, Button, Notice, Eye } from '@pos/ui';
import type { AccessPreviewProps } from '../model/access-preview.types';
import { useAccessPreview } from '../model/use-access-preview';
import { AccessMatrix } from './access-matrix';
export function AccessPreview(props: AccessPreviewProps) {
  const { scope, locationId, permissions, simulate = true } = props;
  const { entries, busy, error, preview } = useAccessPreview(props);
  return (
    <div className="stack">
      {error && <Notice>{error}</Notice>}
      <Button
        type="button"
        variant="secondary"
        busy={busy}
        disabled={scope === 'LOCATION' && !locationId}
        onClick={() => void preview()}
      >
        <Eye size={16} />
        {roMessages.message092}
      </Button>
      {entries && <AccessMatrix entries={entries} proposed={!!permissions && simulate} />}
    </div>
  );
}
