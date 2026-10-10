import type { PermissionDefinition } from '../model/catalog.types.js';

export const TABLE_PERMISSIONS = [
  {
    key: 'orders.split',
    label: 'Împărțirea notei și a articolelor',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: false,
    supportedLimits: ['maxAmount'],
  },
  {
    key: 'tables.read',
    label: 'Vizualizarea meselor și vizitelor',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: false,
    supportedLimits: [],
  },
  {
    key: 'tables.manage',
    label: 'Configurarea meselor',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: true,
    supportedLimits: [],
  },
  {
    key: 'tables.visits.manage',
    label: 'Deschiderea și administrarea vizitelor',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: false,
    supportedLimits: [],
  },
  {
    key: 'tables.visits.assign',
    label: 'Schimbarea chelnerului unei vizite',
    scopeTypes: ['LOCATION'],
    delegable: true,
    privileged: false,
    supportedLimits: [],
  },
] as const satisfies readonly PermissionDefinition[];
