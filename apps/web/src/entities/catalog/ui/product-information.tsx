import { NUTRIENT_FIELDS } from '@pos/contracts/product-information';
import { productInformationMessages as text } from '@pos/ui/locales';
import type { ProductInformationViewProps } from '../model/product-information.types';

export function ProductInformationView({ product }: ProductInformationViewProps) {
  const hasNutrition = NUTRIENT_FIELDS.some((name) => product[name] !== null);
  return (
    <details>
      <summary>{text.title}</summary>
      <p>
        {product.allergens === null
          ? text.allergensUnknown
          : product.allergens.length
            ? `${text.allergens}: ${product.allergens.join(', ')}`
            : text.allergensEmpty}
      </p>
      <p>
        {product.ingredients === null
          ? text.ingredientsUnknown
          : product.ingredients.length
            ? `${text.ingredients}: ${product.ingredients.join(', ')}`
            : text.ingredientsEmpty}
      </p>
      {hasNutrition ? (
        <>
          <p>{text.bases[product.nutritionBasis]}</p>
          <ul>
            {NUTRIENT_FIELDS.map((name) => (
              <li key={name}>
                {text[name]}: {product[name] ?? text.unset}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{text.nutritionUnknown}</p>
      )}
    </details>
  );
}
