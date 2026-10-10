import { expect, it } from 'vitest';
import { MEDIA_ORGANIZATION_QUOTA_BYTES } from '../config/media.constants';
import { assertMediaQuota } from './media-quota';

it('contabilizează toate activele păstrate și respinge depășirea cotei', () => {
  expect(() => assertMediaQuota(0, 1)).not.toThrow();
  expect(() => assertMediaQuota(MEDIA_ORGANIZATION_QUOTA_BYTES - 1, 1)).not.toThrow();
  expect(() => assertMediaQuota(MEDIA_ORGANIZATION_QUOTA_BYTES, 1)).toThrowError(
    expect.objectContaining({ status: 409, code: 'MEDIA_QUOTA_EXCEEDED' }),
  );
});
