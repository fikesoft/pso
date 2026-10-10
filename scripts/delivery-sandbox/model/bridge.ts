import type {
  WebsiteCatalogResponse,
  WebsiteOrderReceiptResponse,
} from '../../../packages/contracts/src/website-delivery';
import { syntheticCustomer, syntheticDelivery, publicErrorCodes } from '../config/server.constants';
import { requestPos } from './pos-client';
import { storefrontImageUrl } from './image-proxy';
import type { Purchase, StorefrontConfig, UpstreamResult } from './storefront.types';

export function publicResult(result: UpstreamResult): UpstreamResult {
  if (result.status >= 200 && result.status < 300) return result;
  if (result.status === 401) return { status: 401, data: { code: 'INVALID_API_KEY' } };
  if (result.status === 429) return { status: 429, data: { code: 'RATE_LIMITED' } };
  const code =
    typeof result.data.code === 'string' && publicErrorCodes.includes(result.data.code)
      ? result.data.code
      : 'POS_REQUEST_REJECTED';
  return {
    status: result.status >= 400 && result.status <= 599 ? result.status : 502,
    data: { code },
  };
}

export async function readProducts(config: StorefrontConfig, cursor: string | null) {
  const result = await requestPos(
    config,
    `/api/integrations/catalog${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
  );
  if (result.status !== 200) return publicResult(result);
  const catalog = result.data as unknown as WebsiteCatalogResponse;
  return {
    status: 200,
    data: {
      locationCode: catalog.locationCode,
      currency: catalog.currency,
      products: catalog.products.map(
        ({
          productId,
          externalProductId,
          name,
          price,
          unitTotal,
          imageUrl,
          modifierGroups,
          scheduleAvailability,
          calories,
          protein,
          fat,
          carbs,
          nutritionBasis,
          allergens,
          ingredients,
        }) => ({
          productId,
          externalProductId,
          name,
          price,
          unitTotal,
          modifierGroups,
          scheduleAvailability,
          calories,
          protein,
          fat,
          carbs,
          nutritionBasis,
          allergens,
          ingredients,
          imageUrl: storefrontImageUrl(imageUrl, productId),
        }),
      ),
      nextCursor: catalog.nextCursor,
    },
  };
}

export async function buyProduct(config: StorefrontConfig, purchase: Purchase) {
  const result = await requestPos(
    config,
    '/api/integrations/orders',
    {
      schemaVersion: 1,
      externalOrderId: purchase.externalOrderId,
      externalLocationCode: purchase.externalLocationCode,
      expectedTotal: purchase.expectedTotal,
      customer: syntheticCustomer,
      delivery: syntheticDelivery,
      paymentMethod: 'CASH_ON_DELIVERY',
      items: purchase.items ?? [
        { externalProductId: purchase.externalProductId, quantity: '1.000' },
      ],
    },
    purchase.requestKey,
  );
  if (result.status !== 200 && result.status !== 201) return publicResult(result);
  const { receipt } = result.data as unknown as WebsiteOrderReceiptResponse;
  return {
    status: result.status,
    data: {
      receipt: {
        id: receipt.id,
        externalOrderId: receipt.externalOrderId,
        status: receipt.status,
        total: receipt.total,
        currency: receipt.currency,
        orderId: receipt.orderId,
      },
    },
  };
}
