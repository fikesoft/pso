import type { createApi } from '../../../shared/api/client';
import type { EnrollmentResponse } from '../model/authentication.types';
export async function enrollAuthenticator(api: ReturnType<typeof createApi>) {
  const { data } = await api.http.post<EnrollmentResponse>('/auth/mfa/enroll', {});
  return data;
}
