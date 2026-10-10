import { Button, Loading, Notice, Select } from '@pos/ui';
import { addressManagementMessages as text } from '@pos/ui/locales';
import type { AddressManagementQuery } from '@pos/contracts';
import type { AddressBookProps } from '../model/address-book.types';
import { useAddressBook } from '../model/use-address-book';
import { AddressBookRecovery } from './address-book-recovery';
import { AddressForm } from './address-form';
import { AddressCard } from './address-card';
export function AddressBook(props: AddressBookProps) {
  const model = useAddressBook(props);
  return (
    <section className="form-stack" aria-label={text.title}>
      <h3>{text.title}</h3>
      <p className="section-note">{text.description}</p>
      <div className="inline">
        <Button
          variant="secondary"
          disabled={model.pending || props.parentLocked || model.list.loading}
          onClick={() => void model.refresh()}
        >
          {text.refresh}
        </Button>
        {model.canMutate && (
          <Button disabled={model.locked} onClick={() => model.setEditing(null)}>
            {text.newAddress}
          </Button>
        )}
      </div>
      <Select
        label={text.filter}
        value={model.filter}
        disabled={model.pending || props.parentLocked}
        onChange={(event) =>
          model.changeFilter(event.target.value as AddressManagementQuery['status'])
        }
      >
        <option value="ACTIVE">{text.active}</option>
        <option value="ARCHIVED">{text.archived}</option>
        <option value="ALL">{text.all}</option>
      </Select>
      <AddressBookRecovery model={model} />
      {model.list.error && <Notice>{model.list.error}</Notice>}
      {model.editing !== undefined && model.canMutate && (
        <AddressForm
          key={model.editing?.id ?? 'new'}
          profile={model.editing ?? undefined}
          disabled={model.locked}
          onSave={model.save}
          onCancel={() => model.setEditing(undefined)}
        />
      )}
      {model.list.loading ? (
        <Loading />
      ) : model.list.error ? null : (
        <>
          {!model.list.data?.addresses.length && <p>{text.empty}</p>}
          {model.list.data?.addresses.map((address) => (
            <AddressCard key={`${address.id}:${address.version}`} address={address} model={model} />
          ))}
          {model.list.data?.nextCursor && (
            <Button variant="secondary" disabled={model.locked} onClick={() => void model.more()}>
              {text.more}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
