import { DeliveryZonesSection } from './delivery-zones-section';
import { CouriersSection } from './couriers-section';
import { CourierWorkSection } from './courier-work-section';
import { CustomerSection } from './customer-section';
import { TableWorkspaceSection } from './table-workspace';
import { OperationsSection } from './operations-section';
import { InventorySection } from './inventory-section';
import { roMessages, Button, Empty, Loading } from '@pos/ui';
import type { WorkspaceComponentProps } from '../model/workspace.types';
import { OverviewSection } from './overview-section';
import { LocationsSection } from './locations-section';
import { StaffSection } from './staff-section';
import { RolesSection } from './roles-section';
import { DelegationsSection } from './delegations-section';
import { AuditSection } from './audit-section';
import { AccessSection } from './access-section';
import { WebsiteDeliverySection } from './website-delivery-section';
import { BrandManagement } from '../../../features/brand-management';
import { AttendanceWorkspace } from '../../../features/attendance';
import { CashRegisterSection } from './cash-register-section';
export function WorkspaceContent({ model }: WorkspaceComponentProps) {
  const { context, loading, allowed, view } = model;
  if (!context)
    return loading ? (
      <Loading />
    ) : (
      <Empty title={roMessages.message167} description={roMessages.message168}>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          {roMessages.message169}
        </Button>
      </Empty>
    );
  if (!allowed) return <Empty title={roMessages.message170} description={roMessages.message171} />;
  switch (view) {
    case 'couriers':
      return <CouriersSection model={model} />;
    case 'courier-work':
      return <CourierWorkSection model={model} />;
    case 'delivery-zones':
      return <DeliveryZonesSection model={model} />;
    case 'customers':
      return <CustomerSection model={model} />;
    case 'tables':
      return <TableWorkspaceSection model={model} />;
    case 'cash-registers':
      return <CashRegisterSection model={model} />;
    case 'attendance':
      return (
        <AttendanceWorkspace
          key={model.locationId}
          api={model.api}
          locationId={model.locationId}
          userId={model.actor.id}
          locationName={model.locationName}
          timezone={model.locations.find((location) => location.id === model.locationId)?.timezone}
          canClock={model.can('attendance.clock')}
          canRead={model.can('attendance.read')}
        />
      );
    case 'brands':
      return <BrandManagement api={model.api} canManage={model.can('locations.manage')} />;
    case 'inventory':
      return <InventorySection model={model} />;
    case 'website-delivery':
      return <WebsiteDeliverySection model={model} />;
    case 'catalog':
    case 'operator':
    case 'cashier':
    case 'orders':
    case 'kitchen':
    case 'packing':
      return <OperationsSection model={model} />;
    case 'overview':
      return <OverviewSection model={model} />;
    case 'locations':
      return <LocationsSection model={model} />;
    case 'staff':
      return <StaffSection model={model} />;
    case 'roles':
      return <RolesSection model={model} />;
    case 'delegations':
      return <DelegationsSection model={model} />;
    case 'audit':
      return <AuditSection model={model} />;
    case 'access':
      return <AccessSection model={model} />;
    default:
      return <AccessSection model={model} />;
  }
}
