import { roMessages } from '@pos/ui';
import type { DemoTicket } from '../model/demo-ticket.types';
export const demoTickets: DemoTicket[] = [
  {
    id: '041',
    table: roMessages.message001,
    time: '03:24',
    tone: 'fresh',
    items: [
      { qty: 2, name: roMessages.message002, note: roMessages.message003 },
      { qty: 1, name: roMessages.message004, note: '' },
    ],
  },
  {
    id: '042',
    table: roMessages.message005,
    time: '06:18',
    tone: 'working',
    items: [
      { qty: 1, name: roMessages.message006, note: roMessages.message007 },
      { qty: 2, name: roMessages.message008, note: '' },
    ],
  },
  {
    id: '043',
    table: roMessages.message009,
    time: '01:47',
    tone: 'fresh',
    items: [{ qty: 3, name: roMessages.message002, note: '' }],
  },
  {
    id: '044',
    table: roMessages.message010,
    time: '09:12',
    tone: 'working',
    items: [
      { qty: 2, name: roMessages.message008, note: roMessages.message011 },
      { qty: 1, name: roMessages.message004, note: '' },
    ],
  },
];
