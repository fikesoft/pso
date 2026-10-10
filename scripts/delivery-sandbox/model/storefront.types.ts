export type StorefrontConfig = {
  apiKey: string;
  posOrigin: string;
};

export type PurchaseBase = {
  requestKey: string;
  externalOrderId: string;
  externalLocationCode: string;
  expectedTotal: string;
};

export type PurchaseItem = {
  externalProductId: string;
  quantity: string;
  modifiers: {
    bindingId: string;
    bindingVersion: number;
    groupVersion: number;
    optionIds: string[];
  }[];
};

export type Purchase = PurchaseBase &
  (
    | { externalProductId: string; items?: never }
    | { items: PurchaseItem[]; externalProductId?: never }
  );

export type UpstreamResult = {
  status: number;
  data: Record<string, unknown>;
};
