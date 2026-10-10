import { cashierMessages, operatorMessages } from '@pos/ui/locales';
export const operatorModes = {
  operator: {
    title: operatorMessages.title,
    description: operatorMessages.description,
    catalog: operatorMessages.catalog,
    composerId: 'operator-composer',
    activeOrdersId: 'operator-active-orders',
  },
  cashier: {
    title: cashierMessages.title,
    description: cashierMessages.description,
    catalog: cashierMessages.catalog,
    composerId: 'cashier-composer',
    activeOrdersId: 'cashier-active-orders',
  },
};
