import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDeliverySandbox } from '../../scripts/delivery-sandbox/model/server';
import { readBody } from '../../scripts/delivery-sandbox/model/read-body';

export async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
export async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
export function purchase() {
  const requestKey = randomUUID();
  return {
    requestKey,
    externalOrderId: `local-${requestKey}`,
    externalLocationCode: 'CTR',
    externalProductId: 'TEST',
    expectedTotal: '10.01',
  };
}
export async function storefrontFixture() {
  const key = `test_${randomUUID()}_${randomUUID()}`;
  const productId = randomUUID();
  const imageAssetId = randomUUID();
  const imageBytes = Buffer.from('RIFF\x0c\x00\x00\x00WEBPVP8 ');
  const received: {
    path: string;
    authorization?: string;
    origin?: string;
    cookie?: string;
    requestKey?: string;
    body?: unknown;
  }[] = [];
  const state = {
    status: 200,
    code: 'INVALID_API_KEY',
    redirect: false,
    imageUrlOverride: undefined as string | null | undefined,
    oversizedImage: false,
  };
  const upstream = createServer(async (request, response) => {
    const raw = request.method === 'POST' ? await readBody(request) : '';
    received.push({
      path: request.url!,
      authorization: request.headers.authorization,
      origin: request.headers.origin,
      cookie: request.headers.cookie,
      requestKey: request.headers['idempotency-key'] as string | undefined,
      body: raw ? JSON.parse(raw) : undefined,
    });
    if (state.redirect) {
      response.writeHead(302, { Location: 'http://example.invalid' });
      response.end();
      return;
    }
    if (request.url?.startsWith('/api/integrations/website/products/')) {
      if (state.status !== 200) {
        response.writeHead(state.status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ code: state.code, apiKey: key }));
        return;
      }
      const bytes = state.oversizedImage ? Buffer.alloc(2 * 1024 * 1024 + 1) : imageBytes;
      response.writeHead(200, { 'Content-Type': 'image/webp' });
      response.end(bytes);
      return;
    }
    response.writeHead(state.status, { 'Content-Type': 'application/json' });
    if (state.status !== 200) {
      response.end(JSON.stringify({ code: state.code, error: key, apiKey: key }));
      return;
    }
    if (request.url?.startsWith('/api/integrations/catalog')) {
      response.end(
        JSON.stringify({
          connectionId: randomUUID(),
          locationCode: 'CTR',
          currency: 'MDL',
          products: [
            {
              productId,
              externalProductId: 'TEST',
              name: 'Produs sintetic',
              price: '10.0050',
              unitTotal: '10.01',
              imageUrl:
                state.imageUrlOverride === undefined
                  ? `/api/integrations/website/products/${productId}/image?assetId=${imageAssetId}`
                  : state.imageUrlOverride,
            },
          ],
          nextCursor: null,
          apiKey: key,
        }),
      );
    } else {
      const body = JSON.parse(raw);
      response.end(
        JSON.stringify({
          receipt: {
            id: 'receipt-test',
            externalOrderId: body.externalOrderId,
            status: 'AWAITING_ACCEPTANCE',
            total: body.expectedTotal,
            currency: 'MDL',
            orderId: null,
          },
          apiKey: key,
        }),
      );
    }
  });
  const posOrigin = await listen(upstream);
  const server = createDeliverySandbox({ apiKey: key, posOrigin });
  const origin = await listen(server);
  return {
    key,
    productId,
    imageAssetId,
    imageBytes,
    origin,
    posOrigin,
    server,
    upstream,
    received,
    state,
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    dispose: async () => {
      await close(server);
      await close(upstream);
    },
  };
}
