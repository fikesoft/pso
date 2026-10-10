import type { PermissionDefinition } from '../model/catalog.types.js';
export const COURIER_PERMISSIONS = [
  {
    key: 'couriers.read',
    label: 'Vizualizarea curierilor, stării și încărcării',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: false,
  },
  {
    key: 'couriers.manage',
    label: 'Administrarea profilurilor curierilor',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: true,
  },
  {
    key: 'couriers.availability',
    label: 'Schimbarea disponibilității proprii de curier',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: false,
  },
] as const satisfies readonly PermissionDefinition[];
