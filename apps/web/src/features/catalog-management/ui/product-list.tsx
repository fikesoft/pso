import { ProductInformationView } from '../../../entities/catalog';
import { Badge, Button } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import type { ProductListProps } from '../model/catalog-management.types';
import { ResourceImage } from '../../../entities/file-asset';
export function ProductList({ products, canEdit, onEdit }: ProductListProps) {
  return (
    <div className="operation-product-grid">
      {products.map((product) => (
        <article className="operation-product-card" key={product.id}>
          {product.imageUrl && (
            <ResourceImage
              src={product.imageUrl}
              alt={product.name}
              fallback={product.name}
              className="product-photo"
            />
          )}
          <div className="operation-card-heading">
            <h3>{product.name}</h3>
            <Badge tone={product.enabled && product.status === 'ACTIVE' ? 'success' : 'neutral'}>
              {product.status === 'ARCHIVED'
                ? text.archived
                : product.enabled
                  ? text.available
                  : text.unavailable}
            </Badge>
          </div>
          <small>{product.sku}</small>
          {product.scheduleAvailability?.available === false && (
            <p className="scope-hint">{text.outsideMenuSchedule}</p>
          )}
          <p>{product.description || text.noDescription}</p>
          <small>
            {product.taxRate === null
              ? text.productTaxUnset
              : `${text.productTaxRate}: ${product.taxRate}`}
          </small>
          <ProductInformationView product={product} />
          <div className="operation-card-footer">
            <strong>{product.price === null ? text.noLocalPrice : `${product.price} MDL`}</strong>
            {canEdit && (
              <Button variant="secondary" onClick={() => onEdit(product)}>
                {text.edit}
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
