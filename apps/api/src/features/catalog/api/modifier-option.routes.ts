import {
  MAX_GROUP_ACTIVE_OPTIONS,
  createModifierOptionSchema,
  idSchema,
  updateModifierOptionSchema,
} from '@pos/contracts';
import type { Router } from 'express';
import { modifierOptionDto } from '../../../entities/catalog-modifiers';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireModifierManage } from '../model/modifier-access';

export function addModifierOptionRoutes(router: Router) {
  router.post(
    '/catalog/modifier-groups/:id/options',
    endpoint(async (tx, access, auth, req) => {
      requireModifierManage(access, auth.user.id);
      const groupId = idSchema.parse(req.params.id);
      const body = createModifierOptionSchema.parse(req.body);
      const group = await tx.modifierGroup.findUnique({ where: { id: groupId } });
      assert(group, 404, 'Grupul nu există');
      assert(group.status === 'ACTIVE', 409, 'Grupul este arhivat.');
      const active = await tx.modifierOption.count({
        where: { modifierGroupId: groupId, status: 'ACTIVE' },
      });
      assert(active < MAX_GROUP_ACTIVE_OPTIONS, 409, 'Grupul are deja 20 de opțiuni active.');
      const option = await tx.modifierOption.create({
        data: { ...body, organizationId: access.org.id, modifierGroupId: groupId },
      });
      await audit(tx, auth, req, 'catalog.modifier_option.created', 'MODIFIER_OPTION', option.id);
      return { modifierOption: modifierOptionDto(option) };
    }),
  );
  router.patch(
    '/catalog/modifier-groups/:id/options/:optionId',
    endpoint(async (tx, access, auth, req) => {
      requireModifierManage(access, auth.user.id);
      const groupId = idSchema.parse(req.params.id);
      const id = idSchema.parse(req.params.optionId);
      const body = updateModifierOptionSchema.parse(req.body);
      const [group, current] = await Promise.all([
        tx.modifierGroup.findUnique({ where: { id: groupId } }),
        tx.modifierOption.findUnique({ where: { id } }),
      ]);
      assert(group, 404, 'Grupul nu există');
      assert(current?.modifierGroupId === groupId, 404, 'Opțiunea nu există');
      assert(current.version === body.version, 409, 'Opțiunea a fost modificată. Reîncărcați.');
      if (body.status === 'ACTIVE' && current.status !== 'ACTIVE') {
        assert(group.status === 'ACTIVE', 409, 'Grupul este arhivat.');
        const active = await tx.modifierOption.count({
          where: { modifierGroupId: groupId, status: 'ACTIVE' },
        });
        assert(active < MAX_GROUP_ACTIVE_OPTIONS, 409, 'Grupul are deja 20 de opțiuni active.');
      }
      if (body.status === 'ARCHIVED' && current.status === 'ACTIVE') {
        const [activeBindings, activeOptions] = await Promise.all([
          tx.productModifierGroup.count({ where: { modifierGroupId: groupId, status: 'ACTIVE' } }),
          tx.modifierOption.count({ where: { modifierGroupId: groupId, status: 'ACTIVE' } }),
        ]);
        assert(
          activeBindings === 0 || activeOptions - 1 >= group.minSelections,
          409,
          'Grupul asociat ar avea prea puține opțiuni active.',
        );
      }
      const { version: _version, ...changes } = body;
      const option = await tx.modifierOption.update({
        where: { id },
        data: { ...changes, version: { increment: 1 } },
      });
      await audit(tx, auth, req, 'catalog.modifier_option.updated', 'MODIFIER_OPTION', id);
      return { modifierOption: modifierOptionDto(option) };
    }),
  );
}
