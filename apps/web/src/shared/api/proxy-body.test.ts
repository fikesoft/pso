import { describe, expect, it } from 'vitest';
import { ProxyBodyTooLarge, readProxyBody } from './proxy-body';
import { tenantImageBodyLimit, tenantJsonBodyLimit } from './proxy.constants';

function request(size: number, method = 'PUT', length?: string) {
  const bytes = new Uint8Array(size).fill(7);
  return new Request('http://127.0.0.1/api/tenant/test', {
    method,
    body: bytes,
    headers: length ? { 'Content-Length': length } : {},
  });
}

describe('limitele proxy înainte de buffering', () => {
  it('păstrează corpul binar al imaginilor până la plafonul explicit', async () => {
    const bytes = await readProxyBody(request(tenantImageBodyLimit), ['staff', 'id', 'avatar']);
    expect(bytes?.byteLength).toBe(tenantImageBodyLimit);
    expect(new Uint8Array(bytes!)[0]).toBe(7);
  });
  it('respinge lungimea declarată mare fără citirea corpului', async () => {
    const body = request(1, 'PUT', String(tenantImageBodyLimit + 1));
    await expect(readProxyBody(body, ['staff', 'id', 'avatar'])).rejects.toBeInstanceOf(
      ProxyBodyTooLarge,
    );
  });
  it('nu se bazează pe Content-Length și verifică octeții reali', async () => {
    await expect(
      readProxyBody(request(tenantImageBodyLimit + 1, 'PUT', '1'), [
        'catalog',
        'products',
        'id',
        'image',
      ]),
    ).rejects.toBeInstanceOf(ProxyBodyTooLarge);
  });
  it('păstrează limita JSON pentru rute și metode care nu sunt încărcări de imagini', async () => {
    for (const [method, path] of [
      ['POST', ['staff', 'id', 'avatar', 'clear']],
      ['PUT', ['staff', 'id']],
      ['POST', ['catalog', 'products']],
    ] as const)
      await expect(
        readProxyBody(request(tenantJsonBodyLimit + 1, method), path),
      ).rejects.toBeInstanceOf(ProxyBodyTooLarge);
    expect((await readProxyBody(request(tenantJsonBodyLimit), ['staff', 'id']))?.byteLength).toBe(
      tenantJsonBodyLimit,
    );
  });
  it('anulează fluxul chunked când limita este depășită', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const input = new Request('http://127.0.0.1', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    await expect(readProxyBody(input, ['orders'])).rejects.toBeInstanceOf(ProxyBodyTooLarge);
    expect(cancelled).toBe(true);
  });
  it('nu creează corp pentru cererile GET', async () => {
    expect(
      await readProxyBody(new Request('http://127.0.0.1'), ['staff', 'id', 'avatar']),
    ).toBeUndefined();
  });
});
