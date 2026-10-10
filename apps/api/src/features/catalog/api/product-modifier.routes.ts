import {
  MAX_PRODUCT_MODIFIER_GROUPS,
  createProductModifierGroupSchema,
  idSchema,
  updateProductModifierGroupSchema,
} from '@pos/contracts';
import type { Router } from 'express';
import { loadModifierGroups } from '../../../entities/catalog-modifiers';
import { audit, endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireModifierManage } from '../model/modifier-access';

export function addProductModifierRoutes(router: Router) {
  router.post(
    '/catalog/products/:id/modifier-groups',
    endpoint(async (tx, access, auth, req) => {
      requireModifierManage(access, auth.user.id);
      const productId = idSchema.parse(req.params.id);
      const body = createProductModifierGroupSchema.parse(req.body);
      const [product, group, existing, count] = await Promise.all([
        tx.product.findUnique({ where: { id: productId } }),
        tx.modifierGroup.findUnique({ where: { id: body.modifierGroupId } }),
        tx.productModifierGroup.findFirst({
          where: { productId, modifierGroupId: body.modifierGroupId },
        }),
        tx.productModifierGroup.count({ where: { productId, status: 'ACTIVE' } }),
      ]);
      assert(product, 404, 'Produsul nu există');
      assert(group, 404, 'Grupul nu există');
      assert(!existing, 409, 'Grupul este deja asociat. Restaurați asocierea existentă.');
      assert(group.status === 'ACTIVE', 409, 'Grupul este arhivat.');
      assert(count < MAX_PRODUCT_MODIFIER_GROUPS, 409, 'Produsul are deja 10 grupuri active.');
      const activeOptions = await tx.modifierOption.count({
        where: { modifierGroupId: group.id, status: 'ACTIVE' },
      });
      assert(activeOptions >= group.minSelections, 409, 'Grupul are prea puține opțiuni active.');
      const binding = await tx.productModifierGroup.create({
        data: { ...body, productId, organizationId: access.org.id },
      });
      await audit(tx, auth, req, 'catalog.product_modifier_group.created', 'PRODUCT', productId);
      const updatedGroup = await tx.modifierGroup.findUniqueOrThrow({ where: { id: group.id } });
      return {
        modifierGroup: {
          id: binding.id,
          productId,
          modifierGroupId: group.id,
          sortOrder: binding.sortOrder,
          status: 'ACTIVE',
          version: binding.version,
          group: (await loadModifierGroups(tx, [updatedGroup]))[0]!,
        },
      };
    }),
  );
  router.patch(
    '/catalog/products/:id/modifier-groups/:bindingId',
    endpoint(async (tx, access, auth, req) => {
      requireModifierManage(access, auth.user.id);
      const productId = idSchema.parse(req.params.id);
      const id = idSchema.parse(req.params.bindingId);
      const body = updateProductModifierGroupSchema.parse(req.body);
      const current = await tx.productModifierGroup.findUnique({ where: { id } });
      assert(current?.productId === productId, 404, 'Asocierea nu există');
      assert(current.version === body.version, 409, 'Asocierea a fost modificată. Reîncărcați.');
      const group = await tx.modifierGroup.findUnique({ where: { id: current.modifierGroupId } });
      assert(group, 404, 'Grupul nu există');
      if (body.status === 'ACTIVE' && current.status !== 'ACTIVE') {
        assert(group.status === 'ACTIVE', 409, 'Grupul este arhivat.');
        const [bindings, options] = await Promise.all([
          tx.productModifierGroup.count({ where: { productId, status: 'ACTIVE' } }),
          tx.modifierOption.count({
            where: { modifierGroupId: group.id, status: 'ACTIVE' },
          }),
        ]);
        assert(bindings < MAX_PRODUCT_MODIFIER_GROUPS, 409, 'Produsul are deja 10 grupuri active.');
        assert(options >= group.minSelections, 409, 'Grupul are prea puține opțiuni active.');
      }
      const { version: _version, ...changes } = body;
      const binding = await tx.productModifierGroup.update({
        where: { id },
        data: { ...changes, version: { increment: 1 } },
      });
      await audit(tx, auth, req, 'catalog.product_modifier_group.updated', 'PRODUCT', productId);
      const updatedGroup = await tx.modifierGroup.findUniqueOrThrow({ where: { id: group.id } });
      return {
        modifierGroup: {
          id,
          productId,
          modifierGroupId: group.id,
          sortOrder: binding.sortOrder,
          status: binding.status,
          version: binding.version,
          group: (await loadModifierGroups(tx, [updatedGroup]))[0]!,
        },
      };
    }),
  );
}
