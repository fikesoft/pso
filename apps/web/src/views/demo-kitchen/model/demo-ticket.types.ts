export interface DemoTicket {
  id: string;
  table: string;
  time: string;
  tone: string;
  items: { qty: number; name: string; note: string }[];
}
