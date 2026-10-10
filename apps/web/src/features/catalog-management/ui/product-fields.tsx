import { ProductInformationFields } from './product-information-fields';
import { Field, Select } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import type { ProductFieldsProps } from '../model/catalog-management.types';
export function ProductFields({ product, categories, metadata, local }: ProductFieldsProps) {
  return (
    <>
      {metadata && (
        <>
          <Field
            label={text.productName}
            name="name"
            defaultValue={product?.name}
            required
            maxLength={150}
          />
          <Field label={text.sku} name="sku" defaultValue={product?.sku} required maxLength={60} />
          <Field
            label={text.description}
            name="description"
            defaultValue={product?.description ?? ''}
            maxLength={1000}
          />
          <Field
            label={text.productTaxRate}
            name="taxRate"
            defaultValue={product?.taxRate ?? ''}
            inputMode="decimal"
            pattern="(?:0|[1-9][0-9]{0,2})([.,][0-9]{1,4})?"
            maxLength={8}
            hint={text.productTaxHint}
          />
          <Select label={text.category} name="categoryId" defaultValue={product?.categoryId ?? ''}>
            <option value="">{text.uncategorized}</option>
            {categories
              .filter(
                (category) => category.status === 'ACTIVE' || category.id === product?.categoryId,
              )
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.status === 'ARCHIVED' ? ` · ${text.archived}` : ''}
                </option>
              ))}
          </Select>
          <ProductInformationFields product={product} />
          {product && (
            <>
              <Select label={text.status} name="status" defaultValue={product.status}>
                <option value="ACTIVE">{text.active}</option>
                <option value="ARCHIVED">{text.archived}</option>
              </Select>
              <p className="muted text-small">{text.archiveProductHint}</p>
            </>
          )}
        </>
      )}
      {local && (
        <>
          <Field
            label={text.localPrice}
            name="price"
            defaultValue={product?.price ?? ''}
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,4})?"
            required
            hint={text.priceHint}
          />
          {product && (
            <label className="check-option">
              <input type="checkbox" name="enabled" defaultChecked={product.enabled} />
              {text.enabledHere}
            </label>
          )}
        </>
      )}
    </>
  );
}
