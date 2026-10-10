export interface OrderAddressContext {
  id: string;
  organizationId: string;
  locationId: string;
}
export interface OrderAddressColumns {
  deliveryAddressEncrypted: string | null;
  deliveryAddressHash: string | null;
}
