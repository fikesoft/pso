import type { Request } from 'express';
import type { TenantAuthState } from '../../../shared/lib/http';
import type { MediaPurpose } from '../../../entities/file-assets';
import type { NormalizedImage } from '../../../entities/file-assets';

export type MediaAction = 'SET' | 'CLEAR';
export type MediaMutationInput = {
  purpose: MediaPurpose;
  action: MediaAction;
  resourceId: string;
  version: number;
  requestKey: string;
  requestHash: string;
  prepared?: { assetId: string; image: NormalizedImage };
  auth: TenantAuthState;
  req: Request;
};
