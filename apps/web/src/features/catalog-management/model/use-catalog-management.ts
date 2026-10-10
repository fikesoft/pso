import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogCategory, CatalogProduct } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { operationalMessages as text } from '@pos/ui/locales';
import { readCatalogProduct, useCatalog } from '../../../entities/catalog';
import { saveCategory, saveProduct } from '../api/catalog-management.api';
import type { CatalogManagementProps, CatalogSaveMode } from './catalog-management.types';
export function useCatalogManagement({
  api,
  locationId,
  canManageCatalog,
}: CatalogManagementProps) {
  const catalog = useCatalog(api, locationId, canManageCatalog);
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [category, setCategory] = useState<CatalogCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageLocked, setImageLocked] = useState(false);
  const [modifiersLocked, setModifiersLocked] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  function edit(value: CatalogProduct | null) {
    setProduct(value);
    setError('');
    setProductOpen(true);
  }
  function editCategory(value: CatalogCategory | null) {
    setCategory(value);
    setError('');
    setCategoryOpen(true);
  }
  async function save(event: FormEvent<HTMLFormElement>, mode: CatalogSaveMode = 'product') {
    event.preventDefault();
    if (pending.current || imageLocked || modifiersLocked) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      if (mode === 'category') await saveCategory(api, category, form);
      else await saveProduct(api, locationId, product, form, mode);
      setCategoryOpen(false);
      setProductOpen(false);
      setNotice(text.saved);
      await catalog.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function reloadProduct() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (product) {
        const next = await readCatalogProduct(api, product.id, locationId);
        setProduct((current) => (current?.id === next.id ? next : current));
      }
      const data = await catalog.refresh();
      if (data) setError('');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function reloadCategory() {
    const data = await catalog.refresh();
    if (category && data)
      setCategory((current) =>
        current?.id === category.id
          ? (data.categories.find((item) => item.id === current.id) ?? current)
          : current,
      );
    if (data) setError('');
  }
  return {
    catalog,
    product,
    productOpen,
    setProductOpen,
    categoryOpen,
    category,
    editCategory,
    reloadCategory,
    setCategoryOpen,
    busy: busy || imageLocked || modifiersLocked,
    metadataBusy: busy,
    modifiersLocked,
    imageLocked,
    setModifiersLocked,
    setImageLocked,
    error,
    notice,
    setError,
    edit,
    save,
    reloadProduct,
  };
}
