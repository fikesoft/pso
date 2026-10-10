import axios from 'axios';
export function isAccessRejection(error: unknown) {
  return axios.isAxiosError(error) && [401, 403, 404].includes(error.response?.status ?? 0);
}
