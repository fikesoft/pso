import { IntegrationDisabledError } from './disabled-adapters';
import type {
  DeliveryImportRequest,
  DeliveryImportResult,
  WebsiteDeliveryAdapter,
} from './website-delivery.types';

/** No network, database writes, credentials or background jobs in this placeholder. */
export class DisabledWebsiteDeliveryAdapter implements WebsiteDeliveryAdapter {
  async importOrder(_request: DeliveryImportRequest): Promise<DeliveryImportResult> {
    throw new IntegrationDisabledError();
  }
}
