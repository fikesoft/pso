import { Router } from 'express';
import { realtimeUrl } from '@pos/contracts/realtime';
import { endpoint } from '../../../entities/tenant-access';
import { config } from '../../../shared/config';

export function realtimeRouter() {
  return Router().get(
    '/realtime/config',
    endpoint(async () => ({
      url: realtimeUrl(
        config.TENANT_ORIGIN,
        config.TENANT_REALTIME_URL,
        config.NODE_ENV !== 'production',
      ),
    })),
  );
}
