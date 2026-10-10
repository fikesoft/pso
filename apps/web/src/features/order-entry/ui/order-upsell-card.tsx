import { useEffect, useRef, useState } from 'react';
import { Button, Notice } from '@pos/ui';
import { errorMessage } from '@pos/ui/api';
import { upsellMessages as text } from '@pos/ui/locales';
import type { OrderUpsellCardProps } from '../model/upsell-entry.types';

export function OrderUpsellCard({
  suggestion,
  disabled,
  ensureShown,
  onAdd,
}: OrderUpsellCardProps) {
  const card = useRef<HTMLElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = card.current;
    if (!element) return;
    let disposed = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          !entries.some((entry) => entry.isIntersecting) ||
          document.visibilityState !== 'visible'
        )
          return;
        observer.disconnect();
        void ensureShown(suggestion).catch((error) => {
          if (!disposed) setError(errorMessage(error));
        });
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [ensureShown, suggestion]);
  async function add() {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const offer = await ensureShown(suggestion);
      onAdd(suggestion.target, offer.id);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <article ref={card} className="panel panel-body stack">
      <strong>{suggestion.target.name}</strong>
      <span>{suggestion.target.price} MDL</span>
      {error && <Notice>{error}</Notice>}
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        busy={busy}
        onClick={() => void add()}
        aria-label={`${text.accept}: ${suggestion.target.name}`}
      >
        {text.accept}
      </Button>
    </article>
  );
}
