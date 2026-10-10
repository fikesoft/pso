/** Planned integration boundary. No provider is configured or contacted by this module. */
export type IntegrationScope = Readonly<{
  organizationId: string;
  locationId: string;
  actorId: string;
}>;
export type ExternalResult =
  | { status: 'CONFIRMED'; externalReference: string }
  | { status: 'REJECTED'; code: string; retryable: boolean }
  | { status: 'UNKNOWN_REQUIRES_REVIEW'; attemptReference: string };
export type FiscalRequest = Readonly<{
  scope: IntegrationScope;
  documentId: string;
  idempotencyKey: string;
  requestHash: string;
  currency: 'MDL';
  total: string;
  lines: readonly { name: string; quantity: string; unitPrice: string; taxCode: string }[];
}>;
export interface FiscalAdapter {
  issue(request: FiscalRequest): Promise<ExternalResult>;
  reconcile(scope: IntegrationScope, attemptReference: string): Promise<ExternalResult>;
}
export interface AccountingAdapter {
  exportDocument(input: {
    scope: IntegrationScope;
    mappingVersion: string;
    documentId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<ExternalResult>;
  reconcile(scope: IntegrationScope, attemptReference: string): Promise<ExternalResult>;
}
export interface ReadOnlyAiAdapter {
  explain(input: {
    scope: IntegrationScope;
    authorizedFunctionResults: readonly { functionName: string; result: unknown }[];
    question: string;
  }): Promise<{ text: string; inputTokens: number; outputTokens: number }>;
}
