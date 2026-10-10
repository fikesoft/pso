import { Notice } from '@pos/ui';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type { CourierAppStatusProps } from '../model/courier-work.types';
export function CourierAppStatus({ online, installed, available }: CourierAppStatusProps) {
  return (
    <>
      {!online && <Notice>{text.offline}</Notice>}
      {installed ? (
        <p>{text.installed}</p>
      ) : (
        available && (
          <details>
            <summary>{text.install}</summary>
            <p>{text.installHint}</p>
          </details>
        )
      )}
    </>
  );
}
