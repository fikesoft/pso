export function avatarUrl(userId: string, assetId: string | null) {
  return assetId ? `/api/tenant/staff/${userId}/avatar?assetId=${assetId}` : null;
}

export function productImageUrl(productId: string, locationId: string, assetId: string | null) {
  return assetId
    ? `/api/tenant/catalog/products/${productId}/image?locationId=${locationId}&assetId=${assetId}`
    : null;
}
