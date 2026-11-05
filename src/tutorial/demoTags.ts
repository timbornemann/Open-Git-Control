import type { DemoRepository } from './demoRepository';
import type { IpcResult } from '@/types/ipc';
import { practiceCommitHash } from '@/shared/tutorial/exampleGitIds';
import { resolveDemoCommit } from './demoHistory';

export type DemoTag = { target: string; oid: string; message?: string };
export const initialDemoTags = () => new Map<string, DemoTag>([['v1.0.0', { target: practiceCommitHash(2), oid: practiceCommitHash(2) }]]);
const ok = (data = ''): IpcResult<string> => ({ success: true, data });
const fail = (error: string): IpcResult<string> => ({ success: false, error });
const lexical = (left: string, right: string) => (left === right ? 0 : left < right ? -1 : 1);
/** Numeric version runs retain Git's leading-zero ordering for the sample tags. */
function versionOrder(left: string, right: string): number {
  const a = left.match(/\d+|\D+/g) || [],
    b = right.match(/\d+|\D+/g) || [];
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const x = a[index],
      y = b[index];
    if (x === y) continue;
    if (/^\d/.test(x) && /^\d/.test(y)) {
      if (x.startsWith('0') !== y.startsWith('0')) return x.startsWith('0') ? -1 : 1;
      if (x.startsWith('0')) {
        const zeros = y.match(/^0+/)![0].length - x.match(/^0+/)![0].length;
        if (zeros) return zeros;
        if (/^0+$/.test(x) !== /^0+$/.test(y)) return /^0+$/.test(x) ? 1 : -1;
      } else if (x.length !== y.length) return x.length - y.length;
    }
    return lexical(x, y);
  }
  return a.length - b.length;
}
function validName(name: string): boolean {
  return (
    Boolean(name) &&
    name !== 'HEAD' &&
    !name.startsWith('-') &&
    !name.endsWith('.') &&
    !name.includes('..') &&
    !name.includes('@{') &&
    ![...name].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || '~^:?*[\\'.includes(char)) &&
    name.split('/').every((segment) => Boolean(segment) && !segment.startsWith('.') && !segment.endsWith('.lock'))
  );
}
function createTag(repo: DemoRepository, args: readonly string[]): IpcResult<string> {
  const positional: string[] = [];
  let annotated = false,
    message: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '-a') annotated = true;
    else if (arg === '-m' && index + 1 < args.length) {
      message = args[++index].trim();
      annotated = true;
    } else if (arg.startsWith('-')) return fail('Choose a supported practice tag action.');
    else positional.push(arg);
  }
  const [name, reference = 'HEAD'] = positional;
  if (positional.length < 1 || positional.length > 2 || !validName(name)) return fail('fatal: ' + JSON.stringify(name || '') + ' is not a valid tag name.');
  if (repo.tags.some((tag) => tag === name || tag.startsWith(name + '/') || name.startsWith(tag + '/')))
    return fail('fatal: The practice tag already exists or conflicts with another tag path.');
  if (annotated && !message) return fail('Enter a message for an annotated practice tag; no external editor is started.');
  const commit = resolveDemoCommit(repo, reference);
  if (!commit) return fail('fatal: The requested practice tag target does not exist.');
  repo.tagRefs.set(name, {
    target: commit.hash,
    oid: annotated ? practiceCommitHash(0x100000 + repo.revision) : commit.hash,
    ...(annotated ? { message } : {}),
  });
  repo.tags.push(name);
  repo.mark('tag-created');
  return ok();
}
export function demoTagCommand(repo: DemoRepository, args: readonly string[]): IpcResult<string> {
  if (!args.length || args.includes('-l') || args.includes('--list')) {
    const sort = args.find((arg) => arg.startsWith('--sort='))?.slice(7) || 'refname';
    if (args.some((arg) => !['-l', '--list', '--sort=' + sort].includes(arg)) || !['refname', '-refname', 'v:refname', '-v:refname'].includes(sort))
      return fail('This practice tag listing is not supported.');
    const names = [...repo.tags].sort(sort.includes('v:') ? versionOrder : lexical);
    if (sort.startsWith('-')) names.reverse();
    return ok(names.join('\n'));
  }
  if (args[0] === '-d' || args[0] === '--delete') {
    const name = args[1];
    if (args.length !== 2) return fail('Delete one practice tag at a time.');
    if (!repo.tagRefs.has(name)) return fail('fatal: The requested practice tag does not exist.');
    repo.tagRefs.delete(name);
    repo.tags = repo.tags.filter((tag) => tag !== name);
    repo.mark('tag-deleted');
    return ok();
  }
  return createTag(repo, args);
}

export function demoTagReferences(repo: DemoRepository, args: readonly string[]): IpcResult<string> {
  const format = args.find((arg) => arg.startsWith('--format='))?.slice(9);
  const prefixes = args.filter((arg) => !arg.startsWith('-'));
  if (!format) return fail('Specify a supported practice reference format.');
  const supported = new Set(['refname', 'refname:short', 'objectname', '*objectname', 'objecttype', '*objecttype', 'contents']);
  if ([...format.matchAll(/%\(([^)]+)\)/g)].some((match) => !supported.has(match[1]))) return fail('This practice reference field is not supported.');
  const records: string[] = [];
  for (const name of [...repo.tags].sort(lexical)) {
    const tag = repo.tagRefs.get(name);
    const reference = 'refs/tags/' + name;
    if (!tag || (prefixes.length && !prefixes.some((prefix) => reference === prefix || reference.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'))))
      continue;
    const commit = resolveDemoCommit(repo, tag.target);
    const values: Record<string, string> = {
      refname: 'refs/tags/' + name,
      'refname:short': name,
      objectname: tag.oid,
      '*objectname': tag.message === undefined ? '' : tag.target,
      objecttype: tag.message === undefined ? 'commit' : 'tag',
      '*objecttype': tag.message === undefined ? '' : 'commit',
      contents: tag.message === undefined ? (commit ? commit.subject + (commit.body ? '\n\n' + commit.body : '') + '\n' : '') : tag.message + '\n',
    };
    const record = format.replace(/%[0-9a-f]{2}|%\(([^)]+)\)/gi, (match, key?: string) =>
      key ? values[key] : String.fromCharCode(Number.parseInt(match.slice(1), 16)),
    );
    records.push(record + '\n');
  }
  return ok(records.join(''));
}
