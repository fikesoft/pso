import type { MediaMutationResponse } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { storageKey } from '../../../entities/file-assets';
import type { AccessData } from '../../../entities/tenant-access';
import { audit } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { writableAvatar, writableProduct } from './media-authorization';
import type { MediaMutationInput } from './media-mutation.types';
import { assertMediaQuota } from './media-quota';

export async function checkMediaReplay(
  tx: TenantTransaction,
  access: AccessData,
  input: MediaMutationInput,
): Promise<MediaMutationResponse | null> {
  const { purpose, resourceId, version, requestKey, auth } = input;
  const current =
    purpose === 'STAFF_AVATAR'
      ? await writableAvatar(tx, access, auth.user.id, resourceId)
      : await writableProduct(tx, access, auth.user.id, resourceId);
  const previous = await tx.fileAssetMutation.findUnique({
    where: {
      organizationId_actorUserId_requestKey: {
        organizationId: access.org.id,
        actorUserId: auth.user.id,
        requestKey,
      },
    },
  });
  if (previous) {
    assert(
      previous.requestHash === input.requestHash,
      409,
      'Cheia cererii a fost folosită pentru alte date.',
    );
    return {
      resourceId,
      version: previous.resourceVersion,
      assetId: previous.assetId,
    };
  }
  assert(current.version === version, 409, 'Resursa a fost modificată. Reîncărcați.');
  return null;
}

export async function mutateMedia(
  tx: TenantTransaction,
  access: AccessData,
  input: MediaMutationInput,
): Promise<MediaMutationResponse> {
  const { purpose, action, resourceId, requestKey, auth, req } = input;
  const previous = await checkMediaReplay(tx, access, input);
  if (previous) return previous;
  let assetId: string | null = null;
  if (action === 'SET') {
    assert(input.prepared, 500, 'Imaginea pregătită lipsește.');
    const { image } = input.prepared;
    const usage = await tx.fileAsset.aggregate({
      where: { organizationId: access.org.id },
      _sum: { size: true },
    });
    assertMediaQuota(usage._sum.size ?? 0, image.bytes.length);
    assetId = input.prepared.assetId;
    await tx.fileAsset.create({
      data: {
        id: assetId,
        organizationId: access.org.id,
        locationId: null,
        purpose,
        employeeId: purpose === 'STAFF_AVATAR' ? resourceId : null,
        productId: purpose === 'PRODUCT_IMAGE' ? resourceId : null,
        storageKey: storageKey(access.org.id, assetId),
        mimeType: 'image/webp',
        size: image.bytes.length,
        width: image.width,
        height: image.height,
        checksum: image.checksum,
        createdByUserId: auth.user.id,
      },
    });
  }
  const updated =
    purpose === 'STAFF_AVATAR'
      ? await tx.companyUser.update({
          where: { id: resourceId },
          data: { avatarAssetId: assetId, version: { increment: 1 } },
        })
      : await tx.product.update({
          where: { id: resourceId },
          data: { imageAssetId: assetId, version: { increment: 1 } },
        });
  await tx.fileAssetMutation.create({
    data: {
      organizationId: access.org.id,
      actorUserId: auth.user.id,
      purpose,
      employeeId: purpose === 'STAFF_AVATAR' ? resourceId : null,
      productId: purpose === 'PRODUCT_IMAGE' ? resourceId : null,
      action,
      assetId,
      requestKey,
      requestHash: input.requestHash,
      resourceVersion: updated.version,
    },
  });
  await audit(
    tx,
    auth,
    req,
    purpose === 'STAFF_AVATAR'
      ? `staff.avatar.${action.toLowerCase()}`
      : `catalog.image.${action.toLowerCase()}`,
    purpose === 'STAFF_AVATAR' ? 'USER' : 'PRODUCT',
    resourceId,
  );
  return { resourceId, version: updated.version, assetId };
}
