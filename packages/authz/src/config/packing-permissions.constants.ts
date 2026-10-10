import type { PermissionDefinition } from '../model/catalog.types.js';

export const PACKING_PERMISSIONS = [
  {
    key: 'packing.read',
    label: 'Vizualizarea ambalării și verificării',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: false,
  },
  {
    key: 'packing.update',
    label: 'Pornirea și verificarea articolelor',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: false,
  },
  {
    key: 'packing.complete',
    label: 'Confirmarea ambalării pentru predare',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: false,
  },
] as const satisfies readonly PermissionDefinition[];
