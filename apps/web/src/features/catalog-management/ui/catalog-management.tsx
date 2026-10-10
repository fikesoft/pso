import { Button, Empty, Loading, Notice, PageTitle, Plus, RefreshCw } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import { useCatalogManagement } from '../model/use-catalog-management';
import type { CatalogManagementProps } from '../model/catalog-management.types';
import { ProductDialog } from './product-dialog';
import { CategoryDialog } from './category-dialog';
import { ProductList } from './product-list';
import { CategoryList } from './category-list';
export function CatalogManagement(props: CatalogManagementProps) {
  const model = useCatalogManagement(props);
  const { data, loading, error, refresh, more, moreLoading } = model.catalog;
  const canEdit = props.canManageCatalog || props.can('catalog.manage');
  return (
    <section className="stack">
      <PageTitle
        title={text.catalog}
        eyebrow={props.locationName}
        description={text.catalogDescription}
      >
        <Button variant="secondary" busy={loading} onClick={() => void refresh()}>
          <RefreshCw size={16} />
          {text.refresh}
        </Button>
        {props.canManageCatalog && (
          <>
            <Button variant="secondary" onClick={() => model.editCategory(null)}>
              {text.newCategory}
            </Button>
            <Button onClick={() => model.edit(null)}>
              <Plus size={16} />
              {text.newProduct}
            </Button>
          </>
        )}
      </PageTitle>
      {error && <Notice>{error}</Notice>}
      {model.notice && <Notice tone="success">{model.notice}</Notice>}
      {!loading && !error && data && props.canManageCatalog && (
        <CategoryList categories={data.categories} onEdit={model.editCategory} />
      )}
      {loading ? (
        <Loading />
      ) : error ? null : !data?.products.length ? (
        <Empty title={text.noProducts} description={text.noProductsHint} />
      ) : (
        <ProductList products={data.products} canEdit={canEdit} onEdit={model.edit} />
      )}
      {data?.nextCursor && !error && (
        <Button variant="secondary" busy={moreLoading} onClick={() => void more()}>
          {text.more}
        </Button>
      )}
      <ProductDialog
        model={model}
        canManageCatalog={props.canManageCatalog}
        renderImage={props.renderImage}
        renderModifiers={props.renderModifiers}
      />
      <CategoryDialog
        category={model.category}
        open={model.categoryOpen}
        busy={model.busy}
        error={error || model.error}
        onClose={() => model.setCategoryOpen(false)}
        onSubmit={(event) => void model.save(event, 'category')}
        onReload={model.reloadCategory}
        loading={loading}
      />
    </section>
  );
}
