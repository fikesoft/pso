export type MediaPurpose = 'STAFF_AVATAR' | 'PRODUCT_IMAGE';
export type NormalizedImage = {
  bytes: Buffer;
  checksum: string;
  width: number;
  height: number;
};
