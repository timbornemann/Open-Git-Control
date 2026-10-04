import { randomBytes } from 'crypto';
import { createServer, type Server } from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type GitCredentialEnvironment = { envOverrides: NodeJS.ProcessEnv; signal?: AbortSignal; dispose: () => void };
export type GitCredentialRequest = {
  connectionId: string;
  urls: string[];
  signal?: AbortSignal;
  envOverrides?: NodeJS.ProcessEnv;
  expectedGeneration?: number;
};
export type GitCredentialIdentity = { username: string; password: string; isCurrent: () => boolean };

function destination(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.password || url.search || url.hash)
    throw new Error('Account credentials can only be supplied to an exact HTTPS Git endpoint.');
  url.username = '';
  return url.href.replace(/\/+$/, '').replace(/\.git$/, '');
}

function configEnvironment(base: NodeJS.ProcessEnv, helper: string, urls: string[]): NodeJS.ProcessEnv {
  const result = { ...base };
  let count = Number(result.GIT_CONFIG_COUNT || process.env.GIT_CONFIG_COUNT || 0);
  if (!Number.isSafeInteger(count) || count < 0 || count > 1000) throw new Error('Invalid inherited Git configuration.');
  const endpointUrls = new Set(
    urls.flatMap((value) => {
      const url = new URL(value);
      const configured = url.href;
      url.username = '';
      return [configured, url.href];
    }),
  );
  for (const [key, value] of [
    ['credential.helper', ''],
    ['credential.helper', helper],
    ['credential.useHttpPath', 'true'],
    ['http.followRedirects', 'false'],
    ['http.extraHeader', ''],
    ...[...endpointUrls].map((url) => [`http.${url}.extraHeader`, '']),
  ]) {
    result[`GIT_CONFIG_KEY_${count}`] = key;
    result[`GIT_CONFIG_VALUE_${count}`] = value;
    count++;
  }
  result.GIT_CONFIG_COUNT = String(count);
  return result;
}

const HELPER_SOURCE = `const http = require('http');
if(process.argv[2] !== 'get') process.exit(0);
let input=''; process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{input+=chunk;if(input.length>16384)process.exit(1);});
process.stdin.on('end',()=>{
  const fields={};for(const line of input.split(/\\r?\\n/)){const index=line.indexOf('=');if(index>0)fields[line.slice(0,index)]=line.slice(index+1);}
  const request = http.request({hostname:'127.0.0.1',port:process.env.OGC_GIT_BROKER_PORT,path:'/',method:'POST',headers:{'Authorization':'Bearer '+process.env.OGC_GIT_BROKER_KEY,'Content-Type':'application/json'},timeout:10000},response=>{
    let data=''; response.on('data',chunk=>{data+=chunk; if(data.length>65536) request.destroy();});
    response.on('end',()=>{if(response.statusCode===200) process.stdout.write(data); else process.exitCode=1;});
  });
  request.on('error',()=>{process.exitCode=1;});request.on('timeout',()=>request.destroy());request.end(JSON.stringify(fields));
});
`;

/** A short-lived loopback broker. Helper files contain no credentials. */
export class HostingCredentialBridge {
  constructor(private readonly credentialFor: (connectionId: string, urls: string[]) => Promise<GitCredentialIdentity>) {}

  async createGitCredentialEnvironment(request: GitCredentialRequest): Promise<GitCredentialEnvironment> {
    const urls = new Set(request.urls.map(destination));
    if (!urls.size) throw new Error('An exact HTTPS destination is required for account authentication.');
    request.signal?.throwIfAborted();
    const identity = await this.credentialFor(request.connectionId, [...urls]);
    request.signal?.throwIfAborted();
    const key = randomBytes(32).toString('hex');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-git-auth-'));
    const helperPath = path.join(directory, 'credential-helper.cjs');
    fs.writeFileSync(helperPath, HELPER_SOURCE, { mode: 0o600 });
    const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
    const helper = `!${quote(process.execPath.replace(/\\/g, '/'))} ${quote(helperPath.replace(/\\/g, '/'))}`;
    let disposed = false;
    let server: Server | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (timer) clearTimeout(timer);
      request.signal?.removeEventListener('abort', dispose);
      server?.closeAllConnections();
      server?.close();
      try {
        fs.rmSync(helperPath, { force: true });
        fs.rmdirSync(directory);
      } catch {
        /* The helper contains no secret. */
      }
    };
    try {
      server = createServer((incoming, outgoing) => {
        if (disposed || !identity.isCurrent() || incoming.method !== 'POST' || incoming.headers.authorization !== `Bearer ${key}`) {
          outgoing.writeHead(403);
          outgoing.end();
          return;
        }
        let body = '';
        incoming.on('data', (chunk: Buffer) => {
          body += chunk.toString();
          if (body.length > 8192) incoming.destroy();
        });
        incoming.on('end', () => {
          try {
            const fields = JSON.parse(body) as { protocol?: unknown; host?: unknown; path?: unknown };
            if (
              fields.protocol !== 'https' ||
              typeof fields.host !== 'string' ||
              typeof fields.path !== 'string' ||
              !urls.has(destination(`https://${fields.host}/${fields.path}`)) ||
              !identity.isCurrent()
            )
              throw new Error('Unbound credential request.');
            if (/\r|\n/.test(identity.username) || /\r|\n/.test(identity.password)) throw new Error('Invalid credential response.');
            outgoing.setHeader('Cache-Control', 'no-store');
            outgoing.end(`username=${identity.username}\npassword=${identity.password}\n\n`);
          } catch {
            outgoing.writeHead(403);
            outgoing.end();
          }
        });
      });
      const port = await new Promise<number>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(0, '127.0.0.1', () => {
          const address = server!.address();
          if (address && typeof address === 'object') resolve(address.port);
          else reject(new Error('Credential broker could not listen.'));
        });
      });
      if (request.signal?.aborted) {
        dispose();
        request.signal.throwIfAborted();
      }
      request.signal?.addEventListener('abort', dispose, { once: true });
      timer = setTimeout(dispose, 10 * 60_000);
      return {
        envOverrides: {
          ...configEnvironment(request.envOverrides || {}, helper, request.urls),
          GIT_ASKPASS: '',
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'never',
          GIT_TRACE: '0',
          GIT_CURL_VERBOSE: '0',
          GIT_TRACE_CURL: '0',
          GIT_TRACE2: '0',
          GIT_TRACE2_EVENT: '0',
          ELECTRON_RUN_AS_NODE: '1',
          OGC_GIT_BROKER_PORT: String(port),
          OGC_GIT_BROKER_KEY: key,
        },
        signal: request.signal,
        dispose,
      };
    } catch (error) {
      dispose();
      throw error;
    }
  }
}
