import type { PermissionDefinition } from '../model/catalog.types.js';
export const CUSTOMER_PERMISSIONS = [
  {
    key: 'customers.read',
    label: 'Vizualizarea clienților organizației',
    scopeTypes: ['ORGANIZATION'],
    delegable: true,
    privileged: false,
  },
  {
    key: 'customers.create',
    label: 'Înregistrarea clienților organizației',
    scopeTypes: ['ORGANIZATION'],
    delegable: true,
    privileged: false,
  },
  {
    key: 'customers.addresses.manage',
    label: 'Administrarea adreselor clienților',
    scopeTypes: ['ORGANIZATION'],
    delegable: true,
    privileged: false,
  },
  {
    key: 'customers.update',
    label: 'Editarea clienților organizației',
    scopeTypes: ['ORGANIZATION'],
    delegable: true,
    privileged: false,
  },
  {
    key: 'customers.archive',
    label: 'Arhivarea și restaurarea clienților organizației',
    scopeTypes: ['ORGANIZATION'],
    delegable: true,
    privileged: false,
  },
  {
    key: 'customers.analytics.read',
    label: 'Analiza clienților organizației',
    scopeTypes: ['ORGANIZATION'],
    delegable: true,
    privileged: false,
  },
] as const satisfies readonly PermissionDefinition[];
