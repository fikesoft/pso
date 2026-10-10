import { createModifierGroupSchema, idSchema, updateModifierGroupSchema } from '@pos/contracts';
import type { Router } from 'express';
import { loadModifierGroups } from '../../../entities/catalog-modifiers';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireModifierManage } from '../model/modifier-access';

export function addModifierGroupRoutes(router: Router) {
  router.post(
    '/catalog/modifier-groups',
    endpoint(async (tx, access, auth, req) => {
      requireModifierManage(access, auth.user.id);
      const body = createModifierGroupSchema.parse(req.body);
      const group = await tx.modifierGroup.create({
        data: { ...body, organizationId: access.org.id, createdByUserId: auth.user.id },
      });
      await audit(tx, auth, req, 'catalog.modifier_group.created', 'MODIFIER_GROUP', group.id);
      return { modifierGroup: (await loadModifierGroups(tx, [group]))[0]! };
    }),
  );
  router.patch(
    '/catalog/modifier-groups/:id',
    endpoint(async (tx, access, auth, req) => {
      requireModifierManage(access, auth.user.id);
      const id = idSchema.parse(req.params.id);
      const body = updateModifierGroupSchema.parse(req.body);
      const current = await tx.modifierGroup.findUnique({ where: { id } });
      assert(current, 404, 'Grupul nu există');
      assert(current.version === body.version, 409, 'Grupul a fost modificat. Reîncărcați.');
      const minSelections = body.minSelections ?? current.minSelections;
      const maxSelections = body.maxSelections ?? current.maxSelections;
      assert(minSelections <= maxSelections, 400, 'Numărul minim depășește maximul.');
      const activeBindings = await tx.productModifierGroup.count({
        where: { modifierGroupId: id, status: 'ACTIVE' },
      });
      if (body.status === 'ARCHIVED' && current.status === 'ACTIVE')
        assert(activeBindings === 0, 409, 'Arhivați mai întâi asocierile active.');
      if (activeBindings && minSelections > 0) {
        const activeOptions = await tx.modifierOption.count({
          where: { modifierGroupId: id, status: 'ACTIVE' },
        });
        assert(activeOptions >= minSelections, 409, 'Grupul are prea puține opțiuni active.');
      }
      const { version: _version, ...changes } = body;
      const group = await tx.modifierGroup.update({
        where: { id },
        data: { ...changes, version: { increment: 1 } },
      });
      await audit(tx, auth, req, 'catalog.modifier_group.updated', 'MODIFIER_GROUP', id);
      return { modifierGroup: (await loadModifierGroups(tx, [group]))[0]! };
    }),
  );
}
