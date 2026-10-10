import { Button, Modal, Notice, PageTitle } from '@pos/ui';
import { customerManagementMessages as text } from '@pos/ui/locales';
import type { CustomerManagementProps } from '../model/customer-management.types';
import { useCustomerDirectory } from '../model/use-customer-directory';
import { CustomerFilters } from './customer-filters';
import { CustomerList } from './customer-list';
import { CustomerDetail } from './customer-detail';
import { CustomerRecovery } from './customer-recovery';
import { CustomerCreate } from './customer-create';
export function CustomerManagement(props: CustomerManagementProps) {
  const model = useCustomerDirectory(props);
  return (
    <section>
      <PageTitle title={text.title} eyebrow={props.locationName} description={text.description}>
        <Button
          variant="secondary"
          disabled={model.pending || model.list.loading}
          onClick={() => void model.refresh()}
        >
          {text.refresh}
        </Button>
        {props.canCreate && (
          <Button disabled={model.locked} onClick={() => model.setCreating(true)}>
            {text.create}
          </Button>
        )}
      </PageTitle>
      <CustomerFilters model={model} />
      {model.list.error && <Notice>{model.list.error}</Notice>}
      {!model.selected && <CustomerRecovery operation={model.operation} />}
      <CustomerList model={model} />
      <Modal
        open={!!model.selected && !model.list.error}
        title={text.profile}
        onOpenChange={(open) => {
          if (!open && !model.pending) model.setSelected(null);
        }}
      >
        <CustomerRecovery operation={model.operation} />
        {model.selected && (
          <CustomerDetail
            key={model.selected}
            {...props}
            customerId={model.selected}
            operation={model.operation}
            addressLocked={model.addressLocked}
            onAddressLockedChange={model.setAddressLocked}
            locked={model.operation.locked || model.list.loading || !!model.list.error}
          />
        )}
        <Button
          variant="secondary"
          disabled={model.pending}
          onClick={() => model.setSelected(null)}
        >
          {text.close}
        </Button>
      </Modal>
      <Modal
        open={model.creating && props.canCreate && !model.list.error}
        title={text.create}
        onOpenChange={(open) => {
          if (!open && !model.createLocked) model.setCreating(false);
        }}
      >
        {model.creating && props.canCreate && (
          <CustomerCreate
            api={props.api}
            locationId={props.locationId}
            onSaved={model.saved}
            onLockedChange={model.setCreateLocked}
          />
        )}
        <Button
          variant="secondary"
          disabled={model.createLocked}
          onClick={() => model.setCreating(false)}
        >
          {text.cancel}
        </Button>
      </Modal>
    </section>
  );
}
