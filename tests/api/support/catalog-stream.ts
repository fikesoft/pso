import { bases } from './harness';

export async function catalogStream(apiKey: string) {
  const controller = new AbortController();
  const response = await fetch(`${bases.TENANT}/api/integrations/catalog/events`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: controller.signal,
  });
  if (!response.ok || !response.body) throw new Error(`Stream status ${response.status}`);
  const body = response.body;
  const messages: string[] = [];
  const waiters = new Set<() => void>();
  let ended = false;
  const reading = (async () => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (!event.startsWith(':')) messages.push(event);
          for (const notify of waiters) notify();
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch {
      if (!controller.signal.aborted) throw new Error('Unexpected stream failure');
    } finally {
      ended = true;
      for (const notify of waiters) notify();
    }
  })();
  function wait<T>(read: () => T | undefined) {
    return new Promise<T>((resolve, reject) => {
      const notify = () => {
        const value = read();
        if (value !== undefined) {
          clearTimeout(timer);
          waiters.delete(notify);
          resolve(value);
        }
      };
      const timer = setTimeout(() => {
        waiters.delete(notify);
        reject(new Error('Catalog stream timeout'));
      }, 3_000);
      waiters.add(notify);
      notify();
    });
  }
  return {
    messages,
    next: () => wait(() => messages.shift()),
    closed: () => wait(() => ended || undefined),
    close: async () => {
      controller.abort();
      await reading;
    },
  };
}
