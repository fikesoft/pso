import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '@pos/db';
import { requestHash } from '../../shared/lib/idempotency';
import { DEMO_INGREDIENTS } from '../config/demo-ingredients.constants';
import { DEMO_MENU } from '../config/demo-menu.constants';

/** Add missing fixture records only; keep operator edits and immutable recipe history. */
export async function seedDemoCatalog(
  tx: TenantTransaction,
  organizationId: string,
  userId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId},0))`;
  const locations = await tx.location.findMany({ where: { organizationId, status: 'ACTIVE' } });
  let created = 0;
  for (const entry of DEMO_MENU) {
    const category = await tx.category.upsert({
      where: { organizationId_name: { organizationId, name: entry.category } },
      update: {},
      create: { organizationId, name: entry.category },
    });
    // An archived category is an intentional operator decision, never reactivate it.
    if (category.status !== 'ACTIVE') continue;
    const existing = await tx.product.findUnique({
      where: { organizationId_sku: { organizationId, sku: entry.sku } },
    });
    const source = entry.synthetic
      ? 'Exemplu DEMO.'
      : 'Referință: norisushi.md, 26.09.2026. Preț de exemplu în MDL.';
    const product =
      existing ??
      (await tx.product.create({
        data: {
          organizationId,
          categoryId: category.id,
          sku: entry.sku,
          name: entry.name,
          description: `${entry.description} Porție: ${entry.portion}. ${source}`,
          ingredients: entry.ingredientsUnknown
            ? []
            : Object.keys(entry.components).map((key) => DEMO_INGREDIENTS[key]!.name),
          ingredientsDeclared: !entry.ingredientsUnknown,
          createdByUserId: userId,
        },
      }));
    if (!existing) created++;
    if (product.status !== 'ACTIVE') continue;
    for (const location of locations) {
      await tx.locationProduct.upsert({
        where: {
          organizationId_locationId_productId: {
            organizationId,
            locationId: location.id,
            productId: product.id,
          },
        },
        update: {},
        create: {
          organizationId,
          locationId: location.id,
          productId: product.id,
          price: entry.price,
        },
      });
    }
    if (await tx.recipeVersion.findFirst({ where: { organizationId, productId: product.id } }))
      continue;
    const components = [];
    for (const [key, quantity] of Object.entries(entry.components)) {
      const ingredient = DEMO_INGREDIENTS[key]!;
      const item = await tx.inventoryItem.upsert({
        where: { organizationId_sku: { organizationId, sku: `DEMO-ING-${key.toUpperCase()}` } },
        update: {},
        create: {
          organizationId,
          sku: `DEMO-ING-${key.toUpperCase()}`,
          ...ingredient,
          kind: 'INGREDIENT',
          createdByUserId: userId,
        },
      });
      if (item.status !== 'ACTIVE' || item.unit !== ingredient.unit || item.kind !== 'INGREDIENT')
        throw new Error(
          `Articolul demo ${item.sku} a fost modificat; rețeta nu poate fi creată automat.`,
        );
      components.push({ inventoryItemId: item.id, quantityPerUnit: quantity });
    }
    const recipe = await tx.recipeVersion.create({
      data: {
        organizationId,
        productId: product.id,
        version: 1,
        requestKey: randomUUID(),
        requestHash: requestHash(entry),
        reason:
          'Rețetă DEMO: cantități estimative pentru exercițiu, nu rețeta oficială Nori Sushi.',
        createdByUserId: userId,
      },
    });
    await tx.recipeComponent.createMany({
      data: components.map((component, position) => ({
        organizationId,
        recipeVersionId: recipe.id,
        ...component,
        position,
        purpose: 'MAIN',
        serviceTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'PICKUP'],
      })),
    });
  }
  if (created)
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: 'catalog.demo.seeded',
        targetType: 'ORGANIZATION',
        targetId: organizationId,
        outcome: 'SUCCESS',
        requestId: randomUUID(),
        metadata: { productsCreated: created, source: 'local-seed' },
      },
    });
  return { created, locations: locations.length };
}
