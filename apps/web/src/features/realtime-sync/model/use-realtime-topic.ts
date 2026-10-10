import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import type { Api } from '../../../shared/api';
import { readRealtimeConfig } from '../api/realtime.api';
import { REALTIME_RETRY_INITIAL_MS, REALTIME_RETRY_MAX_MS } from '../config/realtime.constants';
import type { RealtimeStatus } from './realtime.types';

export function useRealtimeTopic(
  api: Api,
  locationId: string,
  enabled: boolean,
  topic: 'catalog' | 'orders' | 'kitchen',
) {
  const [status, setStatus] = useState<RealtimeStatus>('disabled');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled || !locationId) {
      setStatus('disabled');
      return;
    }
    let disposed = false;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retryMs = REALTIME_RETRY_INITIAL_MS;
    let denied = false;
    let starting = false;
    function reconnect() {
      if (disposed || denied || timer) return;
      setStatus('unavailable');
      timer = setTimeout(() => {
        timer = undefined;
        void connect();
      }, retryMs);
      retryMs = Math.min(retryMs * 2, REALTIME_RETRY_MAX_MS);
    }
    async function connect() {
      if (disposed || denied || starting) return;
      if (!navigator.onLine) {
        reconnect();
        return;
      }
      setStatus('connecting');
      starting = true;
      try {
        const { url } = await readRealtimeConfig(api);
        if (disposed) return;
        const current = new WebSocket(url);
        socket = current;
        current.onmessage = (event) => {
          if (disposed || current !== socket) return;
          try {
            const message = JSON.parse(String(event.data));
            if (message?.type === 'ready') {
              current.send(JSON.stringify({ type: 'subscribe', topic, locationId }));
            } else if (
              [
                'subscribed',
                'changed',
                'resync',
                'order.created',
                'order.updated',
                'order.ready',
                'order.cancelled',
              ].includes(message?.type) &&
              message.locationId === locationId &&
              message.topic === topic
            ) {
              retryMs = REALTIME_RETRY_INITIAL_MS;
              setStatus('live');
              setRevision((value) => value + 1);
            }
          } catch {
            current.close(1002);
          }
        };
        current.onclose = (event) => {
          if (disposed || current !== socket) return;
          if (event.code === 1008) {
            denied = true;
            setStatus('revoked');
            setRevision((value) => value + 1);
          } else reconnect();
        };
        current.onerror = () => {
          /* onclose owns retry; credentials never enter diagnostics. */
        };
      } catch (error) {
        if (disposed) return;
        if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
          denied = true;
          setStatus('revoked');
          setRevision((value) => value + 1);
        } else reconnect();
      } finally {
        starting = false;
      }
    }
    void connect();
    const resume = () => {
      if (
        socket &&
        (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
      )
        return;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      void connect();
    };
    window.addEventListener('online', resume);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', resume);
      if (socket?.readyState === WebSocket.OPEN) socket.close();
      else if (socket?.readyState === WebSocket.CONNECTING)
        socket.addEventListener('open', () => socket?.close(), { once: true });
    };
  }, [api, locationId, enabled, topic]);
  const signals = useMemo(
    () => ({ [`${topic}:${locationId}`]: revision }),
    [locationId, revision, topic],
  );
  return { status, signals };
}
