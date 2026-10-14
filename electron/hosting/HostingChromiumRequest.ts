import { net } from 'electron';
import { Readable, type Writable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

function responseHeaders(values: Record<string, string | string[]>): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(values)) for (const part of Array.isArray(value) ? value : [value]) headers.append(name, part);
  return headers;
}

/** Electron fetch cancels manual redirects. Capture them without following or forwarding credentials. */
export function hostingManualFetch(input: Request): Promise<Response> {
  input.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const request = net.request({
      url: input.url,
      method: input.method,
      redirect: 'manual',
      credentials: 'omit',
      useSessionCookies: false,
      cache: 'no-store',
      bypassCustomProtocolHandlers: true,
    });
    let incoming: Readable | undefined;
    let upload: Readable | undefined;
    let failed = false;
    let received = false;
    const cleanup = () => input.signal.removeEventListener('abort', abort);
    const fail = (reason: unknown) => {
      if (failed) return;
      failed = true;
      const error = reason instanceof Error ? reason : new Error('Hosting request failed.');
      cleanup();
      reject(error);
      incoming?.destroy(error);
      upload?.unpipe(request as unknown as Writable);
      upload?.destroy();
      request.abort();
    };
    const abort = () => fail(input.signal.reason);
    request.on('error', fail);
    request.once('close', () => {
      // Its upload Writable can close before the network response or TLS error arrives.
      if (!incoming && received) cleanup();
    });
    request.once('redirect', (status, _method, destination, values) => {
      try {
        const headers = responseHeaders(values);
        if (!headers.has('location')) headers.set('location', destination);
        const response = new Response(null, { status, headers });
        received = true;
        resolve(response);
        cleanup();
        upload?.unpipe(request as unknown as Writable);
        upload?.destroy();
        request.abort();
      } catch (error) {
        fail(error);
      }
    });
    request.once('response', (response) => {
      incoming = response as unknown as Readable;
      incoming.once('error', fail);
      incoming.once('end', cleanup);
      incoming.once('close', () => {
        cleanup();
        if (!incoming!.readableEnded) request.abort();
      });
      try {
        const headers = responseHeaders(response.headers);
        const empty = input.method === 'HEAD' || [204, 205, 304].includes(response.statusCode) || headers.get('content-length') === '0';
        const body = empty ? null : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);
        const result = new Response(body, { status: response.statusCode, statusText: response.statusMessage, headers });
        received = true;
        resolve(result);
        if (empty) incoming.resume();
      } catch (error) {
        fail(error);
      }
    });
    input.signal.addEventListener('abort', abort, { once: true });
    if (input.signal.aborted) {
      abort();
      return;
    }
    try {
      for (const [name, value] of input.headers) request.setHeader(name, value);
      if (input.body) {
        upload = Readable.fromWeb(input.body as NodeReadableStream<Uint8Array>);
        upload.once('error', fail);
        upload.pipe(request as unknown as Writable);
      } else request.end();
    } catch (error) {
      fail(error);
    }
  });
}
