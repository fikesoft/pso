export interface OrderCreator {
  id: string;
  displayName: string;
}
export interface OrderCreatorsResponse {
  creators: OrderCreator[];
  nextCursor: string | null;
}
