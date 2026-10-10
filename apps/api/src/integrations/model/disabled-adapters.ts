import type {
  AccountingAdapter,
  ExternalResult,
  FiscalAdapter,
  FiscalRequest,
  IntegrationScope,
  ReadOnlyAiAdapter,
} from './integrations.types';
export class IntegrationDisabledError extends Error {
  readonly code = 'INTEGRATION_NOT_CONFIGURED';
  constructor() {
    super(
      'Integrarea este dezactivată. Configurația, contractul clientului și aprobarea transmiterii datelor lipsesc.',
    );
  }
}
export class DisabledFiscalAdapter implements FiscalAdapter {
  async issue(_request: FiscalRequest): Promise<ExternalResult> {
    throw new IntegrationDisabledError();
  }
  async reconcile(_scope: IntegrationScope, _reference: string): Promise<ExternalResult> {
    throw new IntegrationDisabledError();
  }
}
export class DisabledAccountingAdapter implements AccountingAdapter {
  async exportDocument(
    _input: Parameters<AccountingAdapter['exportDocument']>[0],
  ): Promise<ExternalResult> {
    throw new IntegrationDisabledError();
  }
  async reconcile(_scope: IntegrationScope, _reference: string): Promise<ExternalResult> {
    throw new IntegrationDisabledError();
  }
}
export class DisabledAiAdapter implements ReadOnlyAiAdapter {
  async explain(
    _input: Parameters<ReadOnlyAiAdapter['explain']>[0],
  ): Promise<Awaited<ReturnType<ReadOnlyAiAdapter['explain']>>> {
    throw new IntegrationDisabledError();
  }
}
