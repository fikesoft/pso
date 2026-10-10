import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { OperationsFixture } from './operations.types';

export function assetData(state: OperationsFixture, purpose = 'PRODUCT_IMAGE') {
  const id = randomUUID();
  const organizationId = state.a.organization.id;
  return {
    id,
    organizationId,
    purpose,
    employeeId: purpose === 'STAFF_AVATAR' ? state.a.user.id : null,
    productId: purpose === 'PRODUCT_IMAGE' ? state.catalogA.product.id : null,
    storageKey: `${organizationId}/${id}.webp`,
    mimeType: 'image/webp',
    size: 1024,
    width: 256,
    height: 256,
    checksum: 'a'.repeat(64),
    createdByUserId: state.a.user.id,
  };
}

export function mutationData(
  state: OperationsFixture,
  assetId: string | null,
  resourceVersion: number,
  purpose = 'PRODUCT_IMAGE',
) {
  return {
    organizationId: state.a.organization.id,
    actorUserId: state.a.user.id,
    purpose,
    employeeId: purpose === 'STAFF_AVATAR' ? state.a.user.id : null,
    productId: purpose === 'PRODUCT_IMAGE' ? state.catalogA.product.id : null,
    action: assetId ? 'SET' : 'CLEAR',
    assetId,
    resourceVersion,
    requestKey: randomUUID(),
    requestHash: 'b'.repeat(64),
  };
}

export async function setFixtureAsset(
  state: OperationsFixture,
  tx: Prisma.TransactionClient,
  purpose = 'PRODUCT_IMAGE',
) {
  const asset = await tx.fileAsset.create({ data: assetData(state, purpose) });
  const resource =
    purpose === 'STAFF_AVATAR'
      ? await tx.companyUser.update({
          where: { id: state.a.user.id },
          data: { avatarAssetId: asset.id, version: { increment: 1 } },
        })
      : await tx.product.update({
          where: { id: state.catalogA.product.id },
          data: { imageAssetId: asset.id, version: { increment: 1 } },
        });
  const mutation = await tx.fileAssetMutation.create({
    data: mutationData(state, asset.id, resource.version, purpose),
  });
  return { asset, resource, mutation };
}
