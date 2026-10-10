import { Field, Select } from '@pos/ui';
import { productInformationMessages as text } from '@pos/ui/locales';
import {
  NUTRIENT_FIELDS,
  NUTRITION_BASES,
  MAX_PRODUCT_ALLERGENS,
  MAX_PRODUCT_INGREDIENTS,
} from '@pos/contracts/product-information';
import type { ProductInformationFieldsProps } from '../model/catalog-management.types';
import { DeclaredListField } from './declared-list-field';

export function ProductInformationFields({ product }: ProductInformationFieldsProps) {
  return (
    <details className="form-stack">
      <summary>{text.title}</summary>
      <div className="form-stack">
        <Select
          label={text.basis}
          name="nutritionBasis"
          defaultValue={product?.nutritionBasis ?? 'PER_PORTION'}
        >
          {NUTRITION_BASES.map((basis) => (
            <option key={basis} value={basis}>
              {text.bases[basis]}
            </option>
          ))}
        </Select>
        <div className="two-columns">
          {NUTRIENT_FIELDS.map((name) => (
            <Field
              key={name}
              label={text[name]}
              name={name}
              defaultValue={product?.[name] ?? ''}
              inputMode="decimal"
              maxLength={10}
              pattern="(?:0|[1-9][0-9]{0,5})([.,][0-9]{1,3})?"
              hint={text.optional}
            />
          ))}
        </div>
        <DeclaredListField
          name="allergens"
          value={product?.allergens}
          maximum={MAX_PRODUCT_ALLERGENS}
        />
        <DeclaredListField
          name="ingredients"
          value={product?.ingredients}
          maximum={MAX_PRODUCT_INGREDIENTS}
        />
      </div>
    </details>
  );
}
