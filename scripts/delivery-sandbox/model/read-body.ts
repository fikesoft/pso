import type { IncomingMessage } from 'node:http';
import { sandboxBodyLimit } from '../config/server.constants';

export function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= sandboxBodyLimit) chunks.push(chunk);
      else chunks.length = 0;
    });
    request.on('end', () => {
      if (size > sandboxBodyLimit) reject(new Error('BODY_TOO_LARGE'));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', () => reject(new Error('REQUEST_INTERRUPTED')));
  });
}
