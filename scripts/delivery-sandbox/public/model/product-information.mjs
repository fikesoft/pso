import { informationLabels } from '../config/client.constants.mjs';

export function updateProductInformation(item, product) {
  let details = item.querySelector('[data-product-information]');
  if (!details) {
    details = document.createElement('details');
    details.dataset.productInformation = 'true';
    const summary = document.createElement('summary');
    summary.textContent = informationLabels.title;
    const content = document.createElement('div');
    content.dataset.informationContent = 'true';
    details.append(summary, content);
    item.append(details);
  }
  const paragraphs = [];
  function line(value) {
    const paragraph = document.createElement('p');
    paragraph.textContent = value;
    paragraphs.push(paragraph);
  }
  for (const name of ['allergens', 'ingredients']) {
    const values = product[name];
    line(
      values == null
        ? informationLabels[`${name}Unknown`]
        : values.length
          ? `${informationLabels[name]}: ${values.join(', ')}`
          : informationLabels[`${name}Empty`],
    );
  }
  const names = Object.keys(informationLabels.nutrients);
  if (names.some((name) => product[name] != null)) {
    line(informationLabels.bases[product.nutritionBasis] ?? informationLabels.unset);
    for (const name of names)
      line(`${informationLabels.nutrients[name]}: ${product[name] ?? informationLabels.unset}`);
  } else line(informationLabels.nutritionUnknown);
  details.querySelector('[data-information-content]').replaceChildren(...paragraphs);
}
