import { deliveryZoneMessages, courierMessages, courierWorkMessages } from '@pos/ui/locales';
import { customerManagementMessages } from '@pos/ui/locales';
import { tableMessages } from '@pos/ui/locales';
import { operatorMessages, cashierMessages, cashRegisterMessages } from '@pos/ui/locales';
import { operationalMessages as text } from '@pos/ui/locales';
import { inventoryMessages } from '@pos/ui/locales';
import { websiteDeliveryMessages } from '@pos/ui/locales';
import { locationMessages } from '@pos/ui/locales';
import { attendanceMessages } from '@pos/ui/locales';
import { packingMessages } from '@pos/ui/locales';
import { Store, ShoppingBasket, Monitor } from '@pos/ui';
import {
  ro,
  Eye,
  ShieldCheck,
  Users,
  MapPin,
  KeyRound,
  ScrollText,
  LayoutDashboard,
} from '@pos/ui';
export const workspaceNavigation = [
  {
    id: 'courier-work',
    label: courierWorkMessages.title,
    icon: MapPin,
    permission: 'delivery.update',
  },
  { id: 'couriers', label: courierMessages.title, icon: Users, permission: 'couriers.read' },
  {
    id: 'delivery-zones',
    label: deliveryZoneMessages.title,
    icon: MapPin,
    permission: 'delivery.zones.read',
  },
  {
    id: 'customers',
    label: customerManagementMessages.title,
    icon: Users,
    permission: 'customers.read',
  },
  { id: 'tables', label: tableMessages.title, icon: Store, permission: 'tables.read' },
  {
    id: 'cash-registers',
    label: cashRegisterMessages.title,
    icon: Store,
    permission: 'cash.registers.read',
  },
  {
    id: 'cashier',
    label: cashierMessages.title,
    icon: ShoppingBasket,
    permission: 'orders.create',
  },
  {
    id: 'operator',
    label: operatorMessages.title,
    icon: ShoppingBasket,
    permission: 'orders.create',
  },
  { id: 'catalog', label: text.catalog, icon: Store, permission: 'catalog.read' },
  { id: 'orders', label: text.orders, icon: ShoppingBasket, permission: 'orders.read' },
  { id: 'kitchen', label: text.kitchen, icon: Monitor, permission: 'kitchen.read' },
  { id: 'packing', label: packingMessages.title, icon: ShoppingBasket, permission: 'packing.read' },
  { id: 'inventory', label: inventoryMessages.title, icon: Store, permission: 'inventory.read' },
  { id: 'overview', label: ro.navigation.overview, icon: LayoutDashboard, permission: '' },
  { id: 'locations', label: ro.navigation.locations, icon: MapPin, permission: 'locations.read' },
  { id: 'brands', label: locationMessages.brands, icon: Store, permission: 'locations.read' },
  { id: 'staff', label: ro.navigation.staff, icon: Users, permission: 'staff.read' },
  {
    id: 'attendance',
    label: attendanceMessages.title,
    icon: Users,
    permission: 'attendance.clock',
  },
  { id: 'roles', label: ro.navigation.roles, icon: ShieldCheck, permission: 'roles.read' },
  {
    id: 'delegations',
    label: ro.navigation.delegations,
    icon: KeyRound,
    permission: 'staff.delegate',
  },
  { id: 'access', label: ro.navigation.access, icon: Eye, permission: '' },
  { id: 'audit', label: ro.navigation.audit, icon: ScrollText, permission: 'audit.read' },
  {
    id: 'website-delivery',
    label: websiteDeliveryMessages.navigation,
    icon: Store,
    permission: 'orders.read',
  },
];
export const workspaceTitles = Object.fromEntries(workspaceNavigation.map((n) => [n.id, n.label]));

export const mobileNavigationQuery = '(max-width: 767px)';
