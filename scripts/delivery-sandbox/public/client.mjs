import { updateProductInformation } from './model/product-information.mjs';
import { errorMessages, statusLabels } from './config/client.constants.mjs';
import { newCartPurchase, readPending, savePending } from './model/purchase.mjs';
import { cartTotal, orderLine } from './model/modifiers.mjs';
import { productCard } from './model/product-card.mjs';
import { watchMenuAvailability } from './model/menu-availability.mjs';

const status = document.getElementById('status');
const response = document.getElementById('response');
const products = document.getElementById('products');
const retry = document.getElementById('retry');
const more = document.getElementById('more');
const cartList = document.getElementById('cart');
const checkout = document.getElementById('checkout');
const cartTotalLabel = document.getElementById('cart-total');
let pending = readPending();
let busy = false;
let cursor = null;
let locationCode = null;
let loadedCursors = [];
const cart = [];
function controls() {
  for (const button of document.querySelectorAll('[data-buy], [data-add]'))
    button.disabled = busy || !!pending || button.dataset.unavailable === 'true';
  document.getElementById('reload').disabled = busy;
  more.disabled = busy;
  retry.hidden = !pending;
  retry.disabled = busy;
  checkout.disabled = busy || !!pending || cart.length === 0 || !locationCode;
}
function renderCart() {
  cartList.replaceChildren();
  for (const [index, line] of cart.entries()) {
    const item = document.createElement('li');
    const choices = line.modifiers.flatMap((group) => group.names);
    item.append(
      document.createTextNode(
        `${line.product.name}${choices.length ? ` — ${choices.join(', ')}` : ''}`,
      ),
    );
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Elimină';
    remove.disabled = busy || !!pending;
    remove.addEventListener('click', () => {
      cart.splice(index, 1);
      renderCart();
    });
    item.append(' ', remove);
    cartList.append(item);
  }
  cartTotalLabel.textContent = `Total: ${cartTotal(cart)} MDL`;
  controls();
}
function failure(data) {
  return (
    errorMessages[data.code] ||
    'Cererea a fost respinsă. Verifică răspunsul sau configurația conexiunii în POS.'
  );
}
async function buy() {
  if (busy || !pending) return;
  busy = true;
  controls();
  const wasUncertain = pending.uncertain;
  pending.uncertain = true;
  savePending(pending);
  status.textContent = 'Se trimite comanda…';
  try {
    const result = await fetch('/api/buy', {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pending.purchase),
      signal: window.AbortSignal.timeout(12_000),
    });
    const data = await result.json();
    response.value = JSON.stringify(data, null, 2);
    if (result.ok && data.receipt) {
      status.textContent = `${statusLabels[data.receipt.status]} Referință: ${data.receipt.externalOrderId}. Total: ${data.receipt.total} ${data.receipt.currency}.`;
      pending = null;
      savePending(null);
      cart.length = 0;
      renderCart();
    } else {
      status.textContent = failure(data);
      // A refused retry must not discard an earlier result that is still unknown.
      if (
        (!wasUncertain &&
          ([400, 413, 415, 422].includes(result.status) ||
            ['MENU_SCHEDULE_UNAVAILABLE', 'MODIFIER_CONFIGURATION_STALE'].includes(data.code))) ||
        data.code === 'WEBSITE_PRICE_CHANGED'
      ) {
        pending = null;
        savePending(null);
        cart.length = 0;
        renderCart();
        products.replaceChildren();
        more.hidden = true;
      }
    }
  } catch {
    status.textContent = errorMessages.POS_UNAVAILABLE;
  } finally {
    busy = false;
    controls();
  }
}
function appendProducts(data) {
  const existing = new Map([...products.children].map((item) => [item.dataset.product, item]));
  for (const product of data.products) {
    const current = existing.get(product.externalProductId);
    if (current) {
      updateProductInformation(current, product);
      continue;
    }
    products.append(
      productCard(product, data, {
        canAct: () => !busy && !pending,
        invalid: () => {
          status.textContent = 'Alege numărul permis de opțiuni pentru fiecare grup.';
        },
        buy: (purchase) => {
          pending = { purchase, uncertain: false };
          savePending(pending);
          void buy();
        },
        add: (line) => {
          if (cart.length >= 50) return;
          cart.push(line);
          renderCart();
          status.textContent = 'Produsul a fost adăugat în coș.';
        },
      }),
    );
  }
}
async function load(append = false) {
  if (busy) return;
  busy = true;
  controls();
  const pageCursor = append ? cursor : null;
  try {
    const result = await fetch(
      `/api/products${append && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      {
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: window.AbortSignal.timeout(12_000),
      },
    );
    const data = await result.json();
    if (!result.ok) {
      products.replaceChildren();
      more.hidden = true;
      status.textContent = failure(data);
      response.value = JSON.stringify(data, null, 2);
      return;
    }
    if (!append) products.replaceChildren();
    loadedCursors = append ? [...loadedCursors, pageCursor] : [pageCursor];
    locationCode = data.locationCode;
    appendProducts(data);
    cursor = data.nextCursor;
    more.hidden = !cursor;
    status.textContent = pending
      ? 'Există o comandă fără confirmare. Reîncearcă aceeași comandă înainte de o cumpărare nouă.'
      : products.children.length
        ? 'Alege un produs.'
        : 'Nu există produse disponibile în locația conectată.';
  } catch {
    status.textContent = errorMessages.POS_UNAVAILABLE;
  } finally {
    busy = false;
    controls();
  }
}
retry.addEventListener('click', () => void buy());
checkout.addEventListener('click', () => {
  if (busy || pending || !cart.length || !locationCode) return;
  pending = {
    purchase: newCartPurchase(cart.map(orderLine), locationCode, cartTotal(cart)),
    uncertain: false,
  };
  savePending(pending);
  void buy();
});
document.getElementById('reload').addEventListener('click', () => void load());
more.addEventListener('click', () => void load(true));
void load();
watchMenuAvailability(
  products,
  () => loadedCursors,
  () => !busy,
  (snapshot) => {
    appendProducts(snapshot);
    loadedCursors = snapshot.cursors;
    cursor = snapshot.nextCursor;
    locationCode = snapshot.locationCode;
    more.hidden = !cursor;
    controls();
  },
);
