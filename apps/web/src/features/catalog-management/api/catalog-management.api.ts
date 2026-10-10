import { productInformationForm } from '../model/product-information-form';
import type { CatalogSaveMode } from '../model/catalog-management.types';
import type { CatalogCategory, CatalogProduct } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import { formText } from '../../../shared/lib';
export async function saveCategory(api: Api, category: CatalogCategory | null, form: FormData) {
  const fields = { name: formText(form, 'name'), sortOrder: Number(formText(form, 'sortOrder')) };
  if (category) {
    await api.http.patch(`/catalog/categories/${category.id}`, {
      ...fields,
      version: category.version,
      status: formText(form, 'status'),
    });
  } else await api.http.post('/catalog/categories', fields);
}
export async function saveProduct(
  api: Api,
  locationId: string,
  product: CatalogProduct | null,
  form: FormData,
  mode: CatalogSaveMode,
) {
  const metadata = {
    ...productInformationForm(form),
    name: formText(form, 'name'),
    sku: formText(form, 'sku'),
    description: formText(form, 'description'),
    taxRate: formText(form, 'taxRate').replace(',', '.') || null,
    categoryId: formText(form, 'categoryId') || null,
  };
  if (!product) {
    await api.http.post('/catalog/products', {
      ...metadata,
      ...(metadata.categoryId ? {} : { categoryId: undefined }),
      locationId,
      price: formText(form, 'price'),
    });
    return;
  }
  if (mode === 'metadata') {
    await api.http.patch(`/catalog/products/${product.id}`, {
      ...metadata,
      status: formText(form, 'status'),
      version: product.version,
    });
    return;
  }
  await api.http.put(`/catalog/products/${product.id}/locations/${locationId}`, {
    price: formText(form, 'price'),
    enabled: form.get('enabled') === 'on',
    ...(product.locationVersion === null ? {} : { version: product.locationVersion }),
  });
}
