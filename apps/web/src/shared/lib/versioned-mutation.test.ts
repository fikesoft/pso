import { describe, expect, it } from 'vitest';
import { versionedMutationFailure } from './versioned-mutation';
function response(status: number, data: unknown) {
  return { isAxiosError: true, response: { status, data } };
}
describe('versioned mutation reconciliation', () => {
  it('releases an uncertain attempt only for a trusted version conflict', () => {
    expect(
      versionedMutationFailure(
        response(409, { error: 'Comanda a fost modificată', code: 'REQUEST_REJECTED' }),
        true,
      ),
    ).toEqual({ stale: true, uncertain: false });
    expect(
      versionedMutationFailure(response(409, { error: 'Conflict', code: 'DATA_CONFLICT' }), true),
    ).toEqual({ stale: true, uncertain: false });
  });
  it('retains the original unresolved attempt on proxy conflicts, denied access and network failures', () => {
    for (const error of [
      response(409, 'proxy conflict'),
      response(409, { error: 'Conflict', code: 'UNKNOWN_PROXY' }),
      response(403, { error: 'Acces interzis', code: 'REQUEST_REJECTED' }),
      response(500, {}),
      new Error('network'),
    ])
      expect(versionedMutationFailure(error, true)).toEqual({ stale: false, uncertain: true });
  });
  it('treats an untrusted first conflict as unresolved', () => {
    expect(versionedMutationFailure(response(409, 'proxy conflict'), false)).toEqual({
      stale: false,
      uncertain: true,
    });
  });
  it('allows a definitive first rejection to be corrected without claiming an unknown outcome', () => {
    expect(
      versionedMutationFailure(
        response(400, { error: 'Invalid', code: 'VALIDATION_ERROR' }),
        false,
      ),
    ).toEqual({ stale: false, uncertain: false });
  });
});
