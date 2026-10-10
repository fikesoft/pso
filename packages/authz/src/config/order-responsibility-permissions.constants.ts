import type { PermissionDefinition } from '../model/catalog.types.js';
export const ORDER_RESPONSIBILITY_PERMISSIONS = [
  {
    key: 'orders.handoff',
    label: 'Asumarea și predarea comenzilor proprii',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: false,
    supportedLimits: [],
  },
  {
    key: 'orders.handoff-others',
    label: 'Pregătirea predării comenzilor altui casier',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: true,
    supportedLimits: [],
  },
] as const satisfies readonly PermissionDefinition[];
