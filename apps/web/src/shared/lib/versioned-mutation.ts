import axios from 'axios';
export function versionedMutationFailure(error: unknown, wasUncertain: boolean) {
  const response = axios.isAxiosError(error) ? error.response : undefined;
  const stale =
    response?.status === 409 &&
    typeof response.data?.error === 'string' &&
    ['REQUEST_REJECTED', 'DATA_CONFLICT'].includes(response.data?.code);
  return {
    stale,
    uncertain:
      !stale && (wasUncertain || !response || response.status >= 500 || response.status === 409),
  };
}
