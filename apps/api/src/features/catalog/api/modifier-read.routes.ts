import { idSchema, modifierDetailQuerySchema, modifierGroupQuerySchema } from '@pos/contracts';
import type { Router } from 'express';
import { loadModifierGroups, modifierOptionDto } from '../../../entities/catalog-modifiers';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireModifierRead } from '../model/modifier-access';

export function addModifierReadRoutes(router: Router) {
  router.get(
    '/catalog/modifier-groups',
    endpoint(async (tx, access, auth, req) => {
      const query = modifierGroupQuerySchema.parse(req.query);
      requireModifierRead(access, auth.user.id, query.locationId, query.includeArchived);
      const rows = await tx.modifierGroup.findMany({
        where: {
          ...(!query.includeArchived ? { status: 'ACTIVE' } : {}),
          ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      });
      return {
        modifierGroups: await loadModifierGroups(tx, rows.slice(0, query.limit)),
        nextCursor: rows.length > query.limit ? rows[query.limit - 1]!.id : null,
      };
    }),
  );
  router.get(
    '/catalog/modifier-groups/:id',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const query = modifierDetailQuerySchema.parse(req.query);
      requireModifierRead(access, auth.user.id, query.locationId, query.includeArchived);
      const group = await tx.modifierGroup.findUnique({ where: { id } });
      assert(group, 404, 'Grupul nu există');
      assert(group.status === 'ACTIVE' || query.includeArchived, 404, 'Grupul nu există');
      return { modifierGroup: (await loadModifierGroups(tx, [group]))[0]! };
    }),
  );
  router.get(
    '/catalog/modifier-groups/:id/options',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const query = modifierGroupQuerySchema.parse(req.query);
      requireModifierRead(access, auth.user.id, query.locationId, query.includeArchived);
      const group = await tx.modifierGroup.findUnique({ where: { id } });
      assert(group, 404, 'Grupul nu există');
      assert(group.status === 'ACTIVE' || query.includeArchived, 404, 'Grupul nu există');
      const options = await tx.modifierOption.findMany({
        where: {
          modifierGroupId: id,
          ...(!query.includeArchived ? { status: 'ACTIVE' } : {}),
          ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      });
      return {
        modifierOptions: options.slice(0, query.limit).map(modifierOptionDto),
        nextCursor: options.length > query.limit ? options[query.limit - 1]!.id : null,
      };
    }),
  );
  router.get(
    '/catalog/modifier-groups/:id/options/:optionId',
    endpoint(async (tx, access, auth, req) => {
      const id = idSchema.parse(req.params.id);
      const optionId = idSchema.parse(req.params.optionId);
      const query = modifierDetailQuerySchema.parse(req.query);
      requireModifierRead(access, auth.user.id, query.locationId, query.includeArchived);
      const group = await tx.modifierGroup.findUnique({ where: { id } });
      assert(group, 404, 'Grupul nu există');
      assert(group.status === 'ACTIVE' || query.includeArchived, 404, 'Grupul nu există');
      const option = await tx.modifierOption.findUnique({ where: { id: optionId } });
      assert(option?.modifierGroupId === id, 404, 'Opțiunea nu există');
      assert(option.status === 'ACTIVE' || query.includeArchived, 404, 'Opțiunea nu există');
      return { modifierOption: modifierOptionDto(option) };
    }),
  );
  router.get(
    '/catalog/products/:id/modifier-groups',
    endpoint(async (tx, access, auth, req) => {
      const productId = idSchema.parse(req.params.id);
      const query = modifierGroupQuerySchema.parse(req.query);
      requireModifierRead(access, auth.user.id, query.locationId, query.includeArchived);
      const product = await tx.product.findUnique({ where: { id: productId } });
      assert(product, 404, 'Produsul nu există');
      assert(product.status === 'ACTIVE' || query.includeArchived, 404, 'Produsul nu există');
      const bindings = await tx.productModifierGroup.findMany({
        where: {
          productId,
          ...(!query.includeArchived ? { status: 'ACTIVE' } : {}),
          ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      });
      const page = bindings.slice(0, query.limit);
      const groups = await tx.modifierGroup.findMany({
        where: { id: { in: page.map((binding) => binding.modifierGroupId) } },
      });
      const loaded = await loadModifierGroups(tx, groups);
      return {
        modifierGroups: page.flatMap((binding) => {
          const group = groups.find((item) => item.id === binding.modifierGroupId);
          if (!group || (!query.includeArchived && group.status !== 'ACTIVE')) return [];
          const dto = loaded.find((item) => item.id === group.id)!;
          return [
            {
              id: binding.id,
              productId: binding.productId,
              modifierGroupId: binding.modifierGroupId,
              sortOrder: binding.sortOrder,
              status: binding.status as 'ACTIVE' | 'ARCHIVED',
              version: binding.version,
              group: dto,
            },
          ];
        }),
        nextCursor: bindings.length > query.limit ? bindings[query.limit - 1]!.id : null,
      };
    }),
  );
}
