import type { PermissionDefinition } from '../model/catalog.types.js';
export const DELIVERY_ZONE_PERMISSIONS = [
  {
    key: 'delivery.zones.read',
    label: 'Vizualizarea zonelor de livrare',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: false,
  },
  {
    key: 'delivery.zones.manage',
    label: 'Administrarea zonelor de livrare',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: true,
  },
] as const satisfies readonly PermissionDefinition[];
