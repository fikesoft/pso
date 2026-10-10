import { operationalMessages as text } from '@pos/ui/locales';
import type { TaxSnapshotProps } from '../model/tax-snapshot.types';
export function TaxSnapshot({ rate }: TaxSnapshotProps) {
  return (
    <p className="section-note">
      {rate === null ? text.taxSnapshotUnknown : `${text.taxSnapshot}: ${rate}%`}
    </p>
  );
}
