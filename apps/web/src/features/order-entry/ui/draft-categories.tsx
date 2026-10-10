import { Button } from '@pos/ui';
import { operatorMessages as text } from '@pos/ui/locales';
import type { DraftCategoriesProps } from '../model/draft-ui.types';
export function DraftCategories({ props }: DraftCategoriesProps) {
  if (!props.search) return null;
  const { categoryId, setCategoryId } = props.search;
  return (
    <div className="operator-categories" role="group" aria-label={text.categories}>
      <Button
        type="button"
        variant="secondary"
        aria-pressed={!categoryId}
        onClick={() => setCategoryId('')}
      >
        {text.all}
      </Button>
      {props.categories
        ?.filter((category) => category.status === 'ACTIVE')
        .map((category) => (
          <Button
            type="button"
            variant="secondary"
            key={category.id}
            aria-pressed={categoryId === category.id}
            onClick={() => setCategoryId(category.id)}
          >
            {category.name}
          </Button>
        ))}
    </div>
  );
}
