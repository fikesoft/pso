import type { Api } from '../../../shared/api';
import { useRealtimeTopic } from './use-realtime-topic';
export function useCatalogRealtime(api: Api, locationId: string, enabled: boolean) {
  return useRealtimeTopic(api, locationId, enabled, 'catalog');
}
export function useOrderRealtime(api: Api, locationId: string, enabled: boolean) {
  return useRealtimeTopic(api, locationId, enabled, 'orders');
}

export function useKitchenRealtime(api: Api, locationId: string, enabled: boolean) {
  return useRealtimeTopic(api, locationId, enabled, 'kitchen');
}
