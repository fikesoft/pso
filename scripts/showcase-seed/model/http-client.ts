// Private Node client: requests only the explicitly provided loopback API.
// It uses real PIN authentication, hashed sessions, CSRF and current authorization.
export class SeedHttpClient {
  private readonly cookies = new Map<string, string>();
  private csrf = '';
  constructor(
    private readonly base: string,
    private readonly origin: string,
  ) {
    const url = new URL(base);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
      throw new Error('Clientul seed acceptă numai API-ul privat de pe loopback.');
  }
  async call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Rută de seed invalidă.');
    const response = await fetch(`${this.base}/api/tenant${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(method === 'GET'
          ? {}
          : { origin: this.origin, 'content-type': 'application/json', 'x-csrf-token': this.csrf }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(';')[0]!;
      const index = first.indexOf('=');
      this.cookies.set(first.slice(0, index), first.slice(index + 1));
    }
    const data = (await response.json()) as T & { csrfToken?: string; code?: string };
    if (data.csrfToken) this.csrf = data.csrfToken;
    // Never print credentials, payloads, cookie values or contact details on failure.
    if (!response.ok)
      throw new Error(
        `Seed API: ${method} ${path}: HTTP ${response.status} (${data.code ?? 'UNKNOWN'}).`,
      );
    return data;
  }
  async login(companySlug: string, pin: string) {
    await this.call('/auth/session');
    const result = await this.call<{ stage: string }>('/auth/pin', 'POST', { companySlug, pin });
    if (result.stage !== 'ready') throw new Error('Un lucrător PIN nu are acces operațional.');
  }
  async logout() {
    await this.call('/auth/logout', 'POST', {});
  }
}
