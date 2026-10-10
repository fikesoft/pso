import { customerManagementResultSchema } from '@pos/contracts';
import type { CustomerManagementDto, CustomerManagementCommand } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import { visibleLocations, scopeFor } from '../../../entities/tenant-access';
import { customerProfile, requireCustomerAccess } from '../../../entities/customer';
import { assert } from '../../../shared/lib/http';
import type { ManagedCustomer, CustomerCommandRow } from './customer-management.types';

export function requireCustomerManagement(
  access: AccessData,
  actor: string,
  locationId: string,
  action?: CustomerManagementCommand['action'],
) {
  requireCustomerAccess({
    organizationId: access.org.id,
    locationId,
    visibleLocationIds: visibleLocations(access, actor).map((location) => location.id),
    canUse: (permission, scope) => access.service.canUse(actor, permission, scope),
  });
  if (action)
    assert(
      access.service.canUse(
        actor,
        action === 'UPDATE' ? 'customers.update' : 'customers.archive',
        scopeFor(access.org.id, {}),
      ),
    );
}
export function managedCustomerResponse(customer: ManagedCustomer): CustomerManagementDto {
  assert(
    customer.status === 'ACTIVE' || customer.status === 'ARCHIVED',
    500,
    'Stare client invalidă.',
  );
  return {
    id: customer.id,
    version: customer.version,
    ...customerProfile(customer),
    status: customer.status,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}
export function customerCommandResult(command: CustomerCommandRow) {
  return customerManagementResultSchema.parse({
    customerId: command.customerId,
    requestKey: command.requestKey,
    action: command.action,
    expectedVersion: command.expectedVersion,
    version: command.resultVersion,
    status: command.resultStatus,
    occurredAt: command.createdAt.toISOString(),
  });
}
