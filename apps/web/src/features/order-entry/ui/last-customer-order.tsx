import { useEffect, useRef, useState } from 'react';
import { Button, Notice } from '@pos/ui';
import { errorMessage } from '@pos/ui/api';
import { repeatMessages as text } from '@pos/ui/locales';
import type { OrderLastCustomerOrderResponse } from '@pos/contracts';
import { readLastCustomerOrder } from '../../../entities/order';
import type { LastCustomerOrderProps } from '../model/order-repeat.types';
export function LastCustomerOrder(props: LastCustomerOrderProps) {
  const [data, setData] = useState<OrderLastCustomerOrderResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function read(cursor?: string) {
    if (props.disabled || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setData(null);
    try {
      const response = await readLastCustomerOrder(
        props.api,
        props.customerId,
        props.locationId,
        cursor,
      );
      if (mounted.current) setData(response);
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="form-stack" aria-label={text.latest}>
      <p className="scope-hint">{text.latestHint}</p>
      <Button
        type="button"
        variant="secondary"
        busy={busy}
        disabled={props.disabled}
        onClick={() => void read()}
      >
        {text.lookupLatest}
      </Button>
      {error && <Notice>{error}</Notice>}
      {data?.order && (
        <article className="order-draft-item">
          <strong>#{data.order.number}</strong>
          <p>
            {data.order.total} {data.order.currency}
          </p>
          <Button
            type="button"
            disabled={props.disabled}
            onClick={() => {
              if (!props.disabled && data.order) props.onRepeat(data.order);
            }}
          >
            {text.repeat}
          </Button>
        </article>
      )}
      {data && !data.order && <p>{data.nextCursor ? text.continuation : text.noLatest}</p>}
      {data && !data.order && data.nextCursor && (
        <Button
          type="button"
          variant="secondary"
          disabled={props.disabled}
          busy={busy}
          onClick={() => void read(data.nextCursor!)}
        >
          {text.moreLatest}
        </Button>
      )}
    </section>
  );
}
