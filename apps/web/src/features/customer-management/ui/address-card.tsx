import styles from './address-card.module.css';
import { useState } from 'react';
import { Badge, Button, Notice } from '@pos/ui';
import { addressManagementMessages as text } from '@pos/ui/locales';
import type { AddressCardProps } from '../model/address-book.types';
export function AddressCard({ address, model }: AddressCardProps) {
  const [confirm, setConfirm] = useState(false);
  const preferred = model.list.data?.preference.defaultAddressId === address.id;
  return (
    <article
      className={`panel panel-body form-stack ${styles.card}`}
      aria-label={address.label || address.address}
    >
      {address.label && <strong>{address.label}</strong>}
      <p>{address.address}</p>
      {address.instructions && <p>{address.instructions}</p>}
      {preferred && <Badge tone="success">{text.default}</Badge>}
      {address.status === 'ARCHIVED' && <Badge>{text.archivedAddress}</Badge>}
      {address.status === 'ACTIVE' && model.canMutate && (
        <>
          <div className="inline">
            <Button
              variant="secondary"
              disabled={model.locked}
              onClick={() => model.setEditing(address)}
            >
              {text.edit}
            </Button>
            <Button
              variant="secondary"
              disabled={model.locked}
              onClick={() => void model.act(address, preferred ? 'CLEAR_DEFAULT' : 'SET_DEFAULT')}
            >
              {preferred ? text.clearDefault : text.setDefault}
            </Button>
            <Button variant="ghost" disabled={model.locked} onClick={() => setConfirm(true)}>
              {text.archive}
            </Button>
          </div>
          {confirm && (
            <>
              <Notice tone="info">{text.archiveHint}</Notice>
              <Button disabled={model.locked} onClick={() => void model.act(address, 'ARCHIVE')}>
                {text.confirmArchive}
              </Button>
              <Button variant="secondary" disabled={model.locked} onClick={() => setConfirm(false)}>
                {text.cancel}
              </Button>
            </>
          )}
        </>
      )}
    </article>
  );
}
