import type { GitCommandName } from '../../src/shared/ipc/gitCommands';
import { normalizeRepositoryRelativePath, toLiteralPathspec } from '../git/RepositoryPathSafety';
import { assertSafeGitRemoteTransport } from '../git/GitRemoteTransportSafety';

export const PATHSPEC_COMMANDS = new Set<GitCommandName>(['add', 'checkout', 'clean', 'diff', 'reset', 'rm', 'show', 'stash']);
const REVISION_COMMANDS = new Set<GitCommandName>(['checkout', 'diff', 'show']);
const SHOW_FORMATS = new Set(['', 'oneline', 'short', 'medium', 'full', 'fuller', 'reference', 'email', 'mboxrd', 'raw']);

export function assertSafeValue(value: string, label: string): void {
  if (!value || value.startsWith('-')) throw new Error(`Invalid ${label}.`);
}

export function assertSafeRevision(value: string, label: string): void {
  assertSafeValue(value, label);
  normalizeRepositoryRelativePath(value.replace(/\\/g, '/'), label);
}

export function assertSafeRemoteUrl(value: string): void {
  assertSafeValue(value, 'remote URL');
  assertSafeGitRemoteTransport(value);
}

/** Custom pretty aliases and signature placeholders can start configured programs. */
export function isSafeShowFormat(arg: string): boolean {
  if (!arg.startsWith('--format=')) return false;
  const format = arg.slice('--format='.length);
  if (SHOW_FORMATS.has(format)) return true;
  if (!format.includes('%') && !/^(?:t?format):/.test(format)) return false;
  return !/%[ +\-]?G/.test(format.replace(/%%/g, ''));
}

/** Keep revision operands distinct from paths, including checkout's destructive path fallback. */
export function normalizeGitPathspecs(args: string[], command: GitCommandName): string[] {
  const separator = args.indexOf('--');
  if (separator < 0) return REVISION_COMMANDS.has(command) ? [...args, '--'] : args;
  if (!PATHSPEC_COMMANDS.has(command)) return args;
  return [...args.slice(0, separator + 1), ...args.slice(separator + 1).map((file) => toLiteralPathspec(file, 'Pathspec'))];
}

/** These IPC reads return repository data without running configured diff/signature programs. */
export function protectGitReadArgs(args: string[]): string[] {
  const [command, ...rest] = args;
  if (!['diff', 'diff-tree', 'show', 'log', 'reflog'].includes(command)) return args;
  const signature = ['show', 'log', 'reflog'].includes(command) ? ['--no-show-signature'] : [];
  const operands = ['show', 'diff'].includes(command) && !rest.includes('--') ? [...rest, '--'] : rest;
  return [command, '--no-ext-diff', '--no-textconv', ...signature, ...operands];
}
