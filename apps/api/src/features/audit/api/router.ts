import { Router } from 'express';
import { endpoint, hasAny, scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function auditRouter() {
  const r = Router();
  r.get(
    '/audit',
    endpoint(async (tx, d, a) => {
      assert(hasAny(d, a.user.id, 'audit.read'));
      const orgScope = d.service.canUse(a.user.id, 'audit.read', scopeFor(d.org.id, {}));
      const ids = d.locations
        .filter((l) =>
          d.service.canUse(
            a.user.id,
            'audit.read',
            scopeFor(d.org.id, { scopeType: 'LOCATION', locationId: l.id }),
          ),
        )
        .map((l) => l.id);
      const events = await tx.auditEvent.findMany({
        where: orgScope ? {} : { locationId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return {
        events: events.map((e) => ({
          id: e.id,
          action: e.action,
          targetId: e.targetId,
          createdAt: e.createdAt,
          outcome: e.outcome,
          actorLabel: d.users.find((u) => u.id === e.actorUserId)?.displayName ?? 'Platformă',
        })),
      };
    }),
  );
  return r;
}
