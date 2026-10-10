import type { CatalogCategory, CatalogProduct } from '@pos/contracts';
import type { FormEvent, ReactNode } from 'react';
import type { OperationalPanelProps } from '../../../shared/model/operations.types';
import type { useCatalogManagement } from './use-catalog-management';
export type CatalogModel = ReturnType<typeof useCatalogManagement>;
export type ProductImageSlot = (
  product: CatalogProduct,
  refresh: () => Promise<void>,
  onLockedChange: (locked: boolean) => void,
) => ReactNode;
export interface CatalogManagementProps extends OperationalPanelProps {
  renderImage?: ProductImageSlot;
  renderModifiers?: ProductImageSlot;
}
export type ProductDialogProps = {
  model: CatalogModel;
  canManageCatalog: boolean;
  renderImage?: ProductImageSlot;
  renderModifiers?: CatalogManagementProps['renderModifiers'];
};
export type ProductListProps = {
  products: CatalogProduct[];
  canEdit: boolean;
  onEdit: (product: CatalogProduct) => void;
};
export type ProductFieldsProps = {
  product: CatalogProduct | null;
  categories: CatalogCategory[];
  metadata: boolean;
  local: boolean;
};
export type CategoryDialogProps = {
  category: CatalogCategory | null;
  open: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReload: () => Promise<void>;
  loading: boolean;
};
export type CategoryListProps = {
  categories: CatalogCategory[];
  onEdit: (category: CatalogCategory) => void;
};

export type CatalogSaveMode = 'category' | 'product' | 'metadata' | 'local';
export interface ProductFormProps extends ProductDialogProps {
  mode: 'product' | 'metadata' | 'local';
}
export interface ProductInformationFieldsProps {
  product: CatalogProduct | null;
}
export interface DeclaredListFieldProps {
  name: 'allergens' | 'ingredients';
  value: string[] | null | undefined;
  maximum: number;
}
