import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import {
  sandboxAssets,
  sandboxHost,
  sandboxRateLimit,
  sandboxRateWindowMs,
} from '../config/server.constants';
import { readBody } from './read-body';
import { buyProduct, readProducts } from './bridge';
import { parsePurchase } from './purchase';
import { validateStorefrontConfig } from './pos-client';
import { readProductImage, storefrontImageRequest } from './image-proxy';
import type { StorefrontConfig } from './storefront.types';
import { createCatalogEventRelay } from './catalog-events';

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}
export function createDeliverySandbox(config: StorefrontConfig) {
  validateStorefrontConfig(config);
  const relay = createCatalogEventRelay(config);
  let windowStart = Date.now();
  let attempts = 0;
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    const expectedHost = `${sandboxHost}:${request.socket.localPort}`;
    if (request.headers.host !== expectedHost) {
      json(response, 403, { code: 'HOST_NOT_ALLOWED' });
      return;
    }
    const url = new URL(request.url ?? '/', `http://${expectedHost}`);
    const asset = sandboxAssets[url.pathname as keyof typeof sandboxAssets];
    if (request.method === 'GET' && asset) {
      try {
        const content = await readFile(new URL(asset[0], import.meta.url));
        response.writeHead(200, { 'Content-Type': asset[1] });
        response.end(content);
      } catch {
        json(response, 500, { code: 'ASSET_UNAVAILABLE' });
      }
      return;
    }
    const imagePath = url.pathname.startsWith('/api/catalog/products/');
    const image = imagePath ? storefrontImageRequest(url) : null;
    if (!['/api/products', '/api/buy', '/api/events'].includes(url.pathname) && !imagePath) {
      json(response, 404, { code: 'NOT_FOUND' });
      return;
    }
    if (imagePath && !image) {
      json(response, 400, { code: 'INVALID_REQUEST' });
      return;
    }
    const method =
      url.pathname === '/api/products' || url.pathname === '/api/events' || imagePath
        ? 'GET'
        : 'POST';
    if (request.method !== method) {
      response.setHeader('Allow', method);
      json(response, 405, { code: 'METHOD_NOT_ALLOWED' });
      return;
    }
    if (
      (request.headers.origin && request.headers.origin !== `http://${expectedHost}`) ||
      (method === 'POST' && request.headers.origin !== `http://${expectedHost}`) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    ) {
      json(response, 403, { code: 'ORIGIN_NOT_ALLOWED' });
      return;
    }
    if (request.headers.authorization) {
      json(response, 400, { code: 'BROWSER_KEY_NOT_ALLOWED' });
      return;
    }
    if (Date.now() - windowStart >= sandboxRateWindowMs) {
      windowStart = Date.now();
      attempts = 0;
    }
    if (++attempts > sandboxRateLimit) {
      response.setHeader('Retry-After', '60');
      json(response, 429, { code: 'RATE_LIMITED' });
      return;
    }
    try {
      if (url.pathname === '/api/events') {
        relay.add(response);
        return;
      }
      if (image) {
        const result = await readProductImage(config, image.productId, image.assetId);
        if (result.status === 200 && result.bytes) {
          response.writeHead(200, {
            'Content-Type': 'image/webp',
            'Content-Length': result.bytes.length,
          });
          response.end(result.bytes);
        } else json(response, result.status, { code: result.code });
        return;
      }
      if (method === 'GET') {
        const cursor = url.searchParams.get('cursor');
        if (
          [...url.searchParams.keys()].some((name) => name !== 'cursor') ||
          (cursor?.length ?? 0) > 200
        ) {
          json(response, 400, { code: 'INVALID_REQUEST' });
          return;
        }
        const result = await readProducts(config, cursor);
        json(response, result.status, result.data);
        return;
      }
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
        json(response, 415, { code: 'JSON_REQUIRED' });
        return;
      }
      const raw = await readBody(request);
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        json(response, 400, { code: 'INVALID_JSON' });
        return;
      }
      const purchase = parsePurchase(value);
      if (!purchase) {
        json(response, 400, { code: 'INVALID_PURCHASE' });
        return;
      }
      const result = await buyProduct(config, purchase);
      json(response, result.status, result.data);
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'BODY_TOO_LARGE';
      json(response, tooLarge ? 413 : 502, {
        code: tooLarge ? 'BODY_TOO_LARGE' : 'POS_UNAVAILABLE',
      });
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.on('close', () => relay.close());
  return server;
}
