import { deliveryZonesRouter } from '../features/delivery-zones';
import { couriersRouter } from '../features/couriers';
import { courierWorkRouter } from '../features/courier-work';
import { kitchenStationsRouter } from '../features/kitchen-stations';
import { kitchenAlertsRouter } from '../features/kitchen-alerts';
import { packingRouter } from '../features/packing';
import { billSplitsRouter } from '../features/bill-splits';
import { diningTablesRouter } from '../features/tables';
import { orderResponsibilitiesRouter } from '../features/order-responsibilities';
import { cashMovementsRouter } from '../features/cash-movements';
import { cashDiscrepanciesRouter } from '../features/cash-discrepancies';
import { cashShiftsRouter } from '../features/cash-shifts';
import { cashRegistersRouter } from '../features/cash-registers';
import { customerAddressesRouter } from '../features/customer-addresses';
import { customersRouter } from '../features/customers';
import { Router } from 'express';
import { authMiddleware } from '../entities/session';
import { attendanceRouter } from '../features/attendance';
import { accessRouter } from '../features/access';
import { auditRouter } from '../features/audit';
import { brandsRouter } from '../features/brands';
import { catalogRouter } from '../features/catalog';
import { checkoutRouter } from '../features/checkout';
import { deliveryRouter } from '../features/delivery';
import { paymentsRouter } from '../features/payments';
import { contextRouter } from '../features/context';
import { delegationsRouter } from '../features/delegations';
import { locationsRouter } from '../features/locations';
import { mediaRouter } from '../features/media';
import { kitchenRouter } from '../features/kitchen';
import { inventoryRouter } from '../features/inventory';
import { websiteTenantRouter } from '../features/website-integration';
import { ordersRouter } from '../features/orders';
import { rolesRouter } from '../features/roles';
import { staffRouter } from '../features/staff';
import { staffaccessRouter } from '../features/staff-access';
import { sessionManagementRouter } from '../features/session-management';
import { realtimeRouter } from '../features/realtime';
export function tenantRouter() {
  return Router().use(
    authMiddleware('TENANT'),
    realtimeRouter(),
    contextRouter(),
    attendanceRouter(),
    brandsRouter(),
    locationsRouter(),
    cashRegistersRouter(),
    diningTablesRouter(),
    billSplitsRouter(),
    kitchenStationsRouter(),
    kitchenAlertsRouter(),
    packingRouter(),
    cashMovementsRouter(),
    cashDiscrepanciesRouter(),
    cashShiftsRouter(),
    staffRouter(),
    sessionManagementRouter(),
    rolesRouter(),
    staffaccessRouter(),
    delegationsRouter(),
    accessRouter(),
    auditRouter(),
    catalogRouter(),
    mediaRouter(),
    orderResponsibilitiesRouter(),
    ordersRouter(),
    customersRouter(),
    customerAddressesRouter(),
    kitchenRouter(),
    checkoutRouter(),
    paymentsRouter(),
    deliveryRouter(),
    deliveryZonesRouter(),
    couriersRouter(),
    courierWorkRouter(),
    inventoryRouter(),
    websiteTenantRouter(),
  );
}
