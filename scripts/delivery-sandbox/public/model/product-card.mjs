import { updateProductInformation } from './product-information.mjs';
import { modifierControls, cartTotal, orderLine } from './modifiers.mjs';
import { newCartPurchase, newPurchase } from './purchase.mjs';

export function productCard(product, catalog, actions) {
  const item = document.createElement('li');
  item.dataset.product = product.externalProductId;
  item.dataset.catalogId = product.productId;
  if (product.imageUrl) {
    const image = document.createElement('img');
    image.src = product.imageUrl;
    image.alt = product.name;
    image.width = 160;
    image.height = 160;
    image.loading = 'lazy';
    item.append(image);
  }
  const title = document.createElement('p');
  title.textContent = `${product.name} — ${product.unitTotal} ${catalog.currency}`;
  const unavailable = product.scheduleAvailability?.available === false;
  const menuHint = document.createElement('span');
  menuHint.dataset.menuHint = 'true';
  menuHint.textContent = unavailable ? ' · În afara programului' : '';
  title.append(menuHint);
  const selectors = modifierControls(product);
  function action(kind, label, invoke) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset[kind] = 'true';
    button.dataset.unavailable = String(unavailable);
    button.textContent = label;
    button.setAttribute(
      'aria-label',
      kind === 'buy' ? `Cumpără ${product.name}` : `Adaugă ${product.name} în coș`,
    );
    button.addEventListener('click', () => {
      if (!actions.canAct() || button.dataset.unavailable === 'true') return;
      const modifiers = selectors.selected();
      if (!modifiers) {
        actions.invalid();
        return;
      }
      invoke(modifiers);
    });
    return button;
  }
  const buy = action('buy', 'Cumpără', (modifiers) => {
    const line = { product, modifiers };
    actions.buy(
      (product.modifierGroups ?? []).length
        ? newCartPurchase([orderLine(line)], catalog.locationCode, cartTotal([line]))
        : newPurchase(product, catalog.locationCode),
    );
  });
  const add = action('add', 'Adaugă în coș', (modifiers) => actions.add({ product, modifiers }));
  item.append(title, selectors.container, buy, ' ', add);
  updateProductInformation(item, product);
  return item;
}
