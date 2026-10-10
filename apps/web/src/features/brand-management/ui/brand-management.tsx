import { useCallback, useState } from 'react';
import { Badge, Button, Empty, Loading, Modal, Notice, PageTitle } from '@pos/ui';
import { locationMessages as text } from '@pos/ui/locales';
import type { Brand } from '@pos/ui/types';
import { readBrands } from '../../../entities/brand';
import { useRemoteData } from '../../../shared/lib';
import type { BrandManagementProps } from '../model/brand-management.types';
import { BrandForm } from './brand-form';

export function BrandManagement({ api, canManage }: BrandManagementProps) {
  const load = useCallback(() => readBrands(api), [api]);
  const brands = useRemoteData(load);
  const [editing, setEditing] = useState<Brand | null | undefined>(undefined);
  const [notice, setNotice] = useState('');
  return (
    <>
      <PageTitle title={text.brands} description={text.brandDescription}>
        {canManage && <Button onClick={() => setEditing(null)}>{text.newBrand}</Button>}
      </PageTitle>
      {notice && <Notice tone="success">{notice}</Notice>}
      {brands.error && <Notice>{brands.error}</Notice>}
      <section className="panel">
        <Button variant="secondary" onClick={() => void brands.refresh()} disabled={brands.loading}>
          {text.refresh}
        </Button>
        {brands.loading ? (
          <Loading />
        ) : brands.error ? null : !brands.data?.length ? (
          <Empty title={text.emptyBrands} description={text.emptyBrandsDescription} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{text.brand}</th>
                <th>{text.brandCode}</th>
                <th>{text.status}</th>
                <th aria-label={text.edit} />
              </tr>
            </thead>
            <tbody>
              {brands.data.map((brand) => (
                <tr key={brand.id}>
                  <td>
                    <strong>{brand.name}</strong>
                  </td>
                  <td data-label={text.brandCode}>{brand.code}</td>
                  <td data-label={text.status}>
                    <Badge tone={brand.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {brand.status === 'ACTIVE' ? text.active : text.disabled}
                    </Badge>
                  </td>
                  <td className="actions-cell">
                    {canManage && (
                      <Button variant="ghost" onClick={() => setEditing(brand)}>
                        {text.edit}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <Modal
        open={editing !== undefined && canManage}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        title={editing ? text.editBrand : text.newBrand}
      >
        {editing !== undefined && (
          <BrandForm
            key={editing?.id ?? 'new'}
            api={api}
            brand={editing}
            onSaved={() => {
              setEditing(undefined);
              setNotice(text.saved);
              void brands.refresh();
            }}
          />
        )}
      </Modal>
    </>
  );
}
