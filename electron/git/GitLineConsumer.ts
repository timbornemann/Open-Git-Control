import { StringDecoder } from 'node:string_decoder';
import { runGitChunkStream } from './GitChunkStream';
import { redactGitSensitiveText } from './GitErrorFormatter';
import type { GitLineFragment, GitLineHandler, GitLineStreamOptions } from './GitProcessTypes';

const MAX_LINE_BYTES = 1024 * 1024;
const FRAGMENT_CHARACTERS = 64 * 1024;
export async function runGitLineConsumer(repo: string, args: string[], onLine: GitLineHandler, signal: AbortSignal, options: GitLineStreamOptions) {
  if (options.fragmentLongLines && options.redactOutput !== false) throw new Error('Fragmented Git lines require an explicit raw-output consumer.');
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let pendingBytes = 0;
  let fragmented = false;
  let first = true;
  const deliver = async (line: string, fragment?: GitLineFragment) => {
    signal.throwIfAborted();
    const value = options.redactOutput === false ? line : redactGitSensitiveText(line);
    if (fragment) await onLine(value, fragment);
    else await onLine(value);
  };
  const append = async (text: string) => {
    pendingBytes += Buffer.byteLength(text);
    if (pendingBytes > MAX_LINE_BYTES) {
      if (!options.fragmentLongLines) throw new Error('Git stream line exceeded the 1 MB limit.');
      fragmented = true;
    }
    pending += text;
    if (!fragmented) return;
    while (pending.length > FRAGMENT_CHARACTERS) {
      let end = FRAGMENT_CHARACTERS;
      const lastCharacter = pending.charCodeAt(end - 1);
      if (lastCharacter >= 0xd800 && lastCharacter <= 0xdbff) end--;
      await deliver(pending.slice(0, end), { first, last: false });
      first = false;
      pending = pending.slice(end);
      // A long generated line must not monopolize Electron's main event loop.
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      signal.throwIfAborted();
    }
    pendingBytes = Buffer.byteLength(pending);
  };
  const finishLine = async () => {
    await deliver(pending.replace(/\r$/, ''), fragmented ? { first, last: true } : undefined);
    pending = '';
    pendingBytes = 0;
    fragmented = false;
    first = true;
  };
  const consume = async (text: string, finish = false) => {
    let start = 0;
    let end: number;
    while ((end = text.indexOf('\n', start)) >= 0) {
      await append(text.slice(start, end));
      await finishLine();
      start = end + 1;
    }
    await append(text.slice(start));
    if (finish && (pending || fragmented)) await finishLine();
  };
  await runGitChunkStream(repo, args, (chunk) => consume(decoder.write(chunk)), signal, undefined, options.envOverrides);
  await consume(decoder.end(), true);
}
