import { availabilityRefreshMs } from '../config/client.constants.mjs';

export function watchMenuAvailability(products, cursors, canRefresh, changed) {
  let running = false;
  let dirty = false;
  let retry;
  function schedule() {
    dirty = true;
    if (retry) return;
    retry = window.setTimeout(() => {
      retry = undefined;
      void refresh();
    }, 250);
  }
  async function refresh() {
    if (running) {
      dirty = true;
      return;
    }
    if (document.visibilityState !== 'visible') {
      dirty = true;
      return;
    }
    if (!canRefresh()) {
      schedule();
      return;
    }
    running = true;
    dirty = false;
    try {
      const pages = Math.max(1, cursors().length);
      const upperBound =
        [...products.children]
          .map((item) => item.dataset.catalogId ?? '')
          .sort()
          .at(-1) ?? '';
      const snapshot = { products: [], cursors: [], nextCursor: null };
      for (
        let index = 0;
        index < pages || (snapshot.nextCursor && snapshot.nextCursor < upperBound);
        index++
      ) {
        const cursor = snapshot.nextCursor;
        snapshot.cursors.push(cursor);
        const response = await fetch(
          `/api/products${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
          {
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            signal: window.AbortSignal.timeout(12_000),
          },
        );
        if (!response.ok) return;
        const data = await response.json();
        snapshot.products.push(...data.products);
        snapshot.nextCursor = data.nextCursor;
        snapshot.currency = data.currency;
        snapshot.locationCode = data.locationCode;
        if (!snapshot.nextCursor) break;
      }
      if (!canRefresh()) {
        dirty = true;
        return;
      }
      const availability = new Map(
        snapshot.products.map((product) => [
          product.externalProductId,
          product.scheduleAvailability?.available !== false,
        ]),
      );
      for (const item of products.children) {
        if (!item.dataset.product) continue;
        const available = availability.get(item.dataset.product) === true;
        for (const button of item.querySelectorAll('[data-buy], [data-add]'))
          button.dataset.unavailable = String(!available);
        const hint = item.querySelector('[data-menu-hint]');
        if (hint) hint.textContent = available ? '' : ' · În afara programului sau indisponibil';
      }
      changed(snapshot);
    } catch {
      // Preserve choices and the cart offline; checkout revalidates on the server.
    } finally {
      running = false;
      if (dirty) schedule();
    }
  }
  const events = new window.EventSource('/api/events');
  events.addEventListener('changed', schedule);
  window.setInterval(() => void refresh(), availabilityRefreshMs);
  window.addEventListener('focus', () => void refresh());
  document.addEventListener('visibilitychange', () => void refresh());
  window.addEventListener('pagehide', () => events.close());
}
