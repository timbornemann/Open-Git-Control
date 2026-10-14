import { Readable, Writable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hostingFetch } from '../HostingNetwork';
import { HostingHttpTransport } from '../providers/HostingHttpTransport';

const native = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('electron', () => ({ net: { request: native.request } }));
class NativeRequest extends Writable {
  readonly headers = new Headers();
  readonly sent: Buffer[] = [];
  aborted = false;
  _write(chunk: Buffer, _encoding: string, done: () => void) {
    this.sent.push(Buffer.from(chunk));
    done();
  }
  setHeader(name: string, value: string) {
    this.headers.set(name, value);
  }
  abort() {
    if (!this.aborted) {
      this.aborted = true;
      this.destroy();
    }
  }
}
let request: NativeRequest;
const response = (body = '{}', statusCode = 200, headers: Record<string, string | string[]> = {}) =>
  Object.assign(Readable.from([Buffer.from(body)]), { statusCode, statusMessage: 'OK', headers });
const client = () => new HostingHttpTransport({ baseUrl: 'https://forge.test/api/v1', getToken: () => 'private-token' });
beforeEach(() => {
  request = new NativeRequest();
  native.request.mockReset().mockReturnValue(request);
});

describe('Chromium requests with controlled redirects', () => {
  it('keeps the authenticated API transport on native networking and streams its response', async () => {
    request.once('finish', () => request.emit('response', response('{"id":7}', 200, { 'x-total': '1' })));
    expect((await client().json('user')).data).toEqual({ id: 7 });
    expect(native.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://forge.test/api/v1/user', redirect: 'manual', credentials: 'omit', useSessionCookies: false, cache: 'no-store' }),
    );
    expect(request.headers.get('authorization')).toBe('Bearer private-token');
  });

  it('exposes a redirect without following it or forwarding authorization', async () => {
    request.once('finish', () => request.emit('redirect', 302, 'GET', 'https://other.test/file', { location: ['https://other.test/file'] }));
    await expect(client().json('redirect')).rejects.toMatchObject({ code: 'unexpected_redirect', status: 302 });
    expect(request.aborted).toBe(true);
    expect(native.request).toHaveBeenCalledTimes(1);
  });

  it('preserves encoded multipart uploads and their generated content type', async () => {
    request.once('finish', () => request.emit('response', response('{"uploaded":true}')));
    const body = new FormData();
    body.append('file', new Blob(['fixture-content']), 'fixture.txt');
    const result = await client().request('upload', { method: 'POST', rawBody: body });
    expect(await result.json()).toEqual({ uploaded: true });
    expect(request.headers.get('content-type')).toContain('multipart/form-data; boundary=');
    expect(Buffer.concat(request.sent).toString()).toContain('fixture-content');
  });

  it.each([204, 205, 200])('drains an empty HTTP %s response', async (status) => {
    const incoming = response('', status, { 'content-length': '0' });
    const ended = new Promise<void>((resolve) => {
      incoming.once('end', resolve);
    });
    request.once('finish', () => request.emit('response', incoming));
    const result = await client().request('empty');
    expect(result.body).toBeNull();
    await ended;
  });

  it('maps native connection failures and aborts the request', async () => {
    request.once('finish', () => request.emit('error', Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' })));
    await expect(client().json('user')).rejects.toMatchObject({ code: 'connection_refused' });
    expect(request.aborted).toBe(true);
  });

  it('waits for the response after the upload Writable closes', async () => {
    request.once('finish', () => setImmediate(() => request.emit('response', response('{"id":7}'))));
    expect((await client().json('user')).data).toEqual({ id: 7 });
  });

  it('preserves a TLS error delivered after the upload Writable closes', async () => {
    request.once('finish', () => setImmediate(() => request.emit('error', new Error('net::ERR_CERT_AUTHORITY_INVALID'))));
    await expect(client().json('user')).rejects.toMatchObject({ code: 'certificate_untrusted' });
  });

  it('cancels a streaming response when the request signal is aborted', async () => {
    const controller = new AbortController();
    const incoming = Object.assign(new Readable({ read() {} }), { statusCode: 200, statusMessage: 'OK', headers: {} });
    request.once('finish', () => {
      request.emit('response', incoming);
      incoming.push(Buffer.from('first'));
    });
    const result = await hostingFetch('https://forge.test/api/v1/user', { redirect: 'manual', signal: controller.signal });
    const reader = result.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('first');
    controller.abort();
    await expect(reader.read()).rejects.toThrow();
    expect(request.aborted).toBe(true);
  });

  it('aborts the network transfer when its response body is cancelled', async () => {
    const incoming = Object.assign(new Readable({ read() {} }), { statusCode: 200, statusMessage: 'OK', headers: {} });
    request.once('finish', () => request.emit('response', incoming));
    const result = await hostingFetch('https://forge.test/api/v1/user', { redirect: 'manual' });
    const closed = new Promise<void>((resolve) => {
      incoming.once('close', resolve);
    });
    await result.body!.cancel();
    await closed;
    expect(request.aborted).toBe(true);
  });

  it('rejects a pre-aborted request before starting network I/O', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(hostingFetch('https://forge.test', { redirect: 'manual', signal: controller.signal })).rejects.toMatchObject({ code: 'request_cancelled' });
    expect(native.request).not.toHaveBeenCalled();
  });

  it('turns invalid response headers into a rejected operation instead of an event-handler exception', async () => {
    request.once('finish', () => request.emit('response', response('{}', 200, { invalid: 'embedded\nnewline' })));
    await expect(client().json('user')).rejects.toMatchObject({ code: 'network_failed' });
    expect(request.aborted).toBe(true);
  });
});
