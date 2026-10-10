import type { KitchenPage } from '../../../entities/kitchen';

export async function readKitchenWindow(
  read: (cursor?: string) => Promise<KitchenPage>,
  depth: number,
): Promise<KitchenPage> {
  const first = await read();
  const tickets = new Map(first.tickets.map((ticket) => [ticket.id, ticket]));
  let cursor = first.nextCursor;
  let sample = first;
  for (let pageNumber = 1; cursor && pageNumber < depth; pageNumber++) {
    const page = await read(cursor);
    sample = page;
    for (const ticket of page.tickets) {
      const previous = tickets.get(ticket.id);
      if (!previous || previous.version <= ticket.version) tickets.set(ticket.id, ticket);
    }
    cursor = page.nextCursor;
  }
  return { ...sample, tickets: [...tickets.values()], nextCursor: cursor };
}
