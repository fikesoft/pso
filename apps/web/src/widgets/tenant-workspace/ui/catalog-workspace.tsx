import { UpsellManagement } from '../../../features/upsell-management';
import { upsellMessages as upsellText } from '@pos/ui/locales';
import { useState } from 'react';
import { Button } from '@pos/ui';
import { modifierMessages as text, menuScheduleMessages as schedulesText } from '@pos/ui/locales';
import { MenuScheduleManagement } from '../../../features/menu-schedule-management';
import { CatalogManagement } from '../../../features/catalog-management';
import { ModifierManagement, ProductModifierGroups } from '../../../features/modifier-management';
import { ResourceImageEditor } from '../../../features/media-management';
import { ModifierRecipeEditor } from '../../../features/inventory-management';
import type {
  CatalogWorkspaceProps,
  SelectedModifierRecipe,
} from '../model/catalog-workspace.types';

export function CatalogWorkspace(props: CatalogWorkspaceProps) {
  const [section, setSection] = useState<'products' | 'modifiers' | 'schedules' | 'upsell'>(
    'products',
  );
  const [recipe, setRecipe] = useState<SelectedModifierRecipe | null>(null);
  return (
    <div className="stack">
      {(props.canManageCatalog || props.can('catalog.manage')) && (
        <div className="attendance-controls">
          <Button
            variant={section === 'products' ? 'primary' : 'secondary'}
            aria-pressed={section === 'products'}
            onClick={() => setSection('products')}
          >
            {text.products}
          </Button>
          {props.canManageCatalog && (
            <Button
              variant={section === 'modifiers' ? 'primary' : 'secondary'}
              aria-pressed={section === 'modifiers'}
              onClick={() => setSection('modifiers')}
            >
              {text.title}
            </Button>
          )}
          {props.can('catalog.manage') && (
            <Button
              variant={section === 'schedules' ? 'primary' : 'secondary'}
              aria-pressed={section === 'schedules'}
              onClick={() => setSection('schedules')}
            >
              {schedulesText.title}
            </Button>
          )}
          {props.can('catalog.manage') && (
            <Button
              variant={section === 'upsell' ? 'primary' : 'secondary'}
              aria-pressed={section === 'upsell'}
              onClick={() => setSection('upsell')}
            >
              {upsellText.title}
            </Button>
          )}
        </div>
      )}
      {section === 'upsell' && props.can('catalog.manage') ? (
        <UpsellManagement
          api={props.api}
          locationId={props.locationId}
          locationName={props.locationName}
        />
      ) : section === 'schedules' && props.can('catalog.manage') ? (
        <MenuScheduleManagement
          api={props.api}
          locationId={props.locationId}
          locationName={props.locationName}
        />
      ) : section === 'modifiers' && props.canManageCatalog ? (
        <ModifierManagement
          api={props.api}
          locationId={props.locationId}
          locationName={props.locationName}
        />
      ) : (
        <CatalogManagement
          {...props}
          renderModifiers={(product, refresh, onLockedChange) => (
            <ProductModifierGroups
              api={props.api}
              locationId={props.locationId}
              product={product}
              editable={props.canManageCatalog}
              onSaved={refresh}
              onLockedChange={onLockedChange}
              onEditRecipe={
                props.canManageRecipes ? (option) => setRecipe({ product, option }) : undefined
              }
            />
          )}
          renderImage={(product, refresh, onLockedChange) => (
            <ResourceImageEditor
              api={props.api}
              resource={{
                kind: 'product',
                id: product.id,
                version: product.version,
                url: product.imageUrl,
              }}
              editable={props.canManageCatalog}
              onSaved={refresh}
              onLockedChange={onLockedChange}
            />
          )}
        />
      )}
      {recipe && (
        <ModifierRecipeEditor
          api={props.api}
          productId={recipe.product.id}
          optionId={recipe.option.id}
          productName={recipe.product.name}
          optionName={recipe.option.name}
          onClose={() => setRecipe(null)}
        />
      )}
    </div>
  );
}
