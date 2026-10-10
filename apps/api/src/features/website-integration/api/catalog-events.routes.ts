import type { Router } from 'express';
import { CATALOG_NOTIFICATION_CHANNEL, catalogNotificationSchema } from '@pos/contracts';
import { assert } from '../../../shared/lib/http';
import { runtime, subscribeDatabaseChannel, withTenantTransaction } from '../../../shared/db';
import { WEBSITE_LIVE_LIMITS } from '../config/website.constants';
import { withIntegrationContext } from '../model/integration-endpoint';
import { validateWebsiteKey } from '../model/validate-key';

const counts = new Map<string, number>();
export function addWebsiteCatalogEventRoutes(router: Router) {
  let total = 0;
  router.get('/catalog/events', async (req, res) => {
    const reference = await withIntegrationContext(req, async (_tx, context) => ({
      organizationId: context.organizationId,
      locationId: context.location.id,
      keyId: context.key.id,
      connectionId: context.connection.id,
      createdByUserId: context.key.createdByUserId,
      digest: context.key.secretHash,
    }));
    assert(
      total < WEBSITE_LIVE_LIMITS.total &&
        (counts.get(reference.keyId) ?? 0) < WEBSITE_LIVE_LIMITS.perKey,
      429,
      'Prea multe conexiuni live',
    );
    counts.set(reference.keyId, (counts.get(reference.keyId) ?? 0) + 1);
    total++;
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    let closed = false;
    let pending = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = async () => {};
    const heartbeat = setInterval(() => void emit(false), WEBSITE_LIVE_LIMITS.heartbeatMs);
    heartbeat.unref();
    function close() {
      if (closed) return;
      closed = true;
      total--;
      const remaining = (counts.get(reference.keyId) ?? 1) - 1;
      if (remaining) counts.set(reference.keyId, remaining);
      else counts.delete(reference.keyId);
      clearInterval(heartbeat);
      if (timer) clearTimeout(timer);
      void unsubscribe();
      res.end();
    }
    async function emit(change: boolean) {
      if (closed) return;
      dirty ||= change;
      if (pending) return;
      pending = true;
      const changed = dirty;
      dirty = false;
      try {
        await withTenantTransaction(runtime, { organizationId: reference.organizationId }, (tx) =>
          validateWebsiteKey(tx, reference),
        );
        if (closed) return;
        if (res.writableLength > WEBSITE_LIVE_LIMITS.maxBufferedBytes) {
          close();
          return;
        }
        res.write(changed ? 'event: changed\ndata: {}\n\n' : ': heartbeat\n\n');
      } catch {
        close();
      } finally {
        pending = false;
        if (dirty && !closed) schedule();
      }
    }
    function schedule() {
      dirty = true;
      if (timer || closed) return;
      timer = setTimeout(() => {
        timer = undefined;
        void emit(true);
      }, WEBSITE_LIVE_LIMITS.debounceMs);
      timer.unref();
    }
    unsubscribe = subscribeDatabaseChannel(CATALOG_NOTIFICATION_CHANNEL, {
      onReady: schedule,
      onDisconnect: close,
      onMessage: (payload) => {
        try {
          const value = catalogNotificationSchema.safeParse(JSON.parse(payload));
          if (
            value.success &&
            value.data.organizationId === reference.organizationId &&
            (!value.data.locationId || value.data.locationId === reference.locationId)
          )
            schedule();
        } catch {
          /* Invalid notifications are not forwarded. */
        }
      },
    });
    res.on('close', close);
    res.on('error', close);
    if (res.destroyed) close();
  });
}
