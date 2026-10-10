import { roMessages } from '@pos/ui';
import type { DemoProduct } from '../model/demo-product.types';
export const demoProducts: DemoProduct[] = [
  {
    id: 'p1',
    name: roMessages.message002,
    category: roMessages.message026,
    detail: roMessages.message027,
    price: '145.00',
    icon: '◉',
  },
  {
    id: 'p2',
    name: roMessages.message004,
    category: roMessages.message026,
    detail: roMessages.message028,
    price: '125.00',
    icon: '▣',
  },
  {
    id: 'p3',
    name: roMessages.message006,
    category: roMessages.message029,
    detail: roMessages.message030,
    price: '320.00',
    icon: '▦',
  },
  {
    id: 'p4',
    name: roMessages.message008,
    category: roMessages.message031,
    detail: roMessages.message032,
    price: '95.00',
    icon: '≋',
  },
  {
    id: 'p5',
    name: roMessages.message033,
    category: roMessages.message034,
    detail: roMessages.message035,
    price: '45.00',
    icon: '◒',
  },
  {
    id: 'p6',
    name: roMessages.message036,
    category: roMessages.message034,
    detail: roMessages.message037,
    price: '35.00',
    icon: '◡',
  },
];
