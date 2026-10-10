import { Badge, Button } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import type { CategoryListProps } from '../model/catalog-management.types';

export function CategoryList({ categories, onEdit }: CategoryListProps) {
  return (
    <section className="panel" aria-label={text.categories}>
      <div className="panel-head">
        <h2>{text.categories}</h2>
      </div>
      {!categories.length ? (
        <p className="panel-body muted">{text.noCategories}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{text.categoryName}</th>
              <th>{text.sortOrder}</th>
              <th>{text.status}</th>
              <th aria-label={text.edit} />
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>
                  <strong>{category.name}</strong>
                </td>
                <td data-label={text.sortOrder}>{category.sortOrder}</td>
                <td data-label={text.status}>
                  <Badge tone={category.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {category.status === 'ACTIVE' ? text.active : text.archived}
                  </Badge>
                </td>
                <td className="actions-cell">
                  <Button variant="ghost" onClick={() => onEdit(category)}>
                    {text.editCategory}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
