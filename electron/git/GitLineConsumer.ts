import { StringDecoder } from 'node:string_decoder';
import { runGitChunkStream } from './GitChunkStream';
import { redactGitSensitiveText } from './GitErrorFormatter';

const MAX_LINE_BYTES = 1024 * 1024;
export async function runGitLineConsumer(
  repo: string,
  args: string[],
  onLine: (line: string) => void,
  signal: AbortSignal,
  options: { redactOutput?: boolean; envOverrides?: NodeJS.ProcessEnv },
) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const deliver = async (line: string) => {
    signal.throwIfAborted();
    const result = (onLine as (line: string) => unknown)(options.redactOutput === false ? line : redactGitSensitiveText(line));
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') await result;
  };
  const consume = async (text: string, finish = false) => {
    let start = 0;
    let end: number;
    while ((end = text.indexOf('\n', start)) >= 0) {
      const part = text.slice(start, end);
      if (Buffer.byteLength(pending) + Buffer.byteLength(part) > MAX_LINE_BYTES) throw new Error('Git stream line exceeded the 1 MB limit.');
      await deliver(`${pending}${part}`.replace(/\r$/, ''));
      pending = '';
      start = end + 1;
    }
    const tail = text.slice(start);
    if (Buffer.byteLength(pending) + Buffer.byteLength(tail) > MAX_LINE_BYTES) throw new Error('Git stream line exceeded the 1 MB limit.');
    pending += tail;
    if (finish && pending) await deliver(pending.replace(/\r$/, ''));
  };
  await runGitChunkStream(repo, args, (chunk) => consume(decoder.write(chunk)), signal, undefined, options.envOverrides);
  await consume(decoder.end(), true);
}
