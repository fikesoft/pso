export interface OrderCustomerContext {
  id: string;
  organizationId: string;
  locationId: string;
}
export interface OrderCustomerColumns {
  customerDataEncrypted: string | null;
  customerNameLookupHash: string | null;
  customerPhoneLookupHash: string | null;
}
