import { REALTIME_DEV_PORT, REALTIME_PATH } from './config/realtime.constants';
export * from './config/realtime.constants';

export function realtimeUrl(
  tenantOrigin: string,
  configured: string | undefined,
  development: boolean,
) {
  const origin = new URL(tenantOrigin);
  const url = configured ? new URL(configured) : new URL(REALTIME_PATH, origin);
  if (!configured) {
    url.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
    if (development && origin.protocol === 'http:') url.port = REALTIME_DEV_PORT;
  }
  if (
    url.hostname !== origin.hostname ||
    !['ws:', 'wss:'].includes(url.protocol) ||
    (origin.protocol === 'https:' && url.protocol !== 'wss:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== REALTIME_PATH
  )
    throw new Error(
      'URL-ul realtime trebuie să folosească gazda tenantului, transportul securizat și ruta publică dedicată.',
    );
  return url.toString();
}
