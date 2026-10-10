import type { BrowserSession } from './support/harness';
import { bases, origins } from './support/harness';

function sessionHeaders(session: BrowserSession) {
  return {
    cookie: [...session.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
  };
}

export async function uploadImage(
  session: BrowserSession,
  path: string,
  bytes: Buffer,
  contentType = 'image/png',
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${bases.TENANT}/api/tenant${path}`, {
    method: 'PUT',
    headers: {
      ...sessionHeaders(session),
      origin: origins.TENANT,
      'x-csrf-token': session.csrf,
      'content-type': contentType,
      ...headers,
    },
    body: new Uint8Array(bytes),
  });
  return { status: response.status, data: await response.json() };
}

export async function readImage(session: BrowserSession, url: string) {
  const response = await fetch(new URL(url, bases.TENANT), {
    headers: sessionHeaders(session),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, contentType: response.headers.get('content-type'), bytes };
}
