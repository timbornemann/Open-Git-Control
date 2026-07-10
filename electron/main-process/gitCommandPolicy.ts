import { isGitCommandName, MAX_ARGS_BY_GIT_COMMAND, type GitCommandName } from '../../src/shared/ipc/gitCommands';
import { normalizeRepositoryRelativePath, toLiteralPathspec } from '../git/RepositoryPathSafety';

export type { GitCommandName };

const COMMIT_HASH_RE = /^[0-9a-f]{7,64}$/i;
const STASH_REF_RE = /^stash@\{\d+\}(?:\^\d+)?$/;
const PATHSPEC_COMMANDS = new Set<GitCommandName>(['add', 'checkout', 'clean', 'diff', 'reset', 'show', 'stash']);

export function createJobId(operation: string): string {
  return operation + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

export function sanitizeArg(arg: unknown): string {
  if (typeof arg !== 'string') {
    throw new Error('Invalid git argument type.');
  }
  if (!arg.trim()) {
    throw new Error('Empty git arguments are not allowed.');
  }
  if (arg.length > 512) {
    throw new Error('Git argument too long.');
  }
  if (/[\0\r\n]/.test(arg)) {
    throw new Error('Control characters are not allowed in git arguments.');
  }
  return arg;
}

export function normalizeArgs(args: unknown[]): string[] {
  return args.map(sanitizeArg);
}

export function assertAllowedGitCommand(commandName: unknown): asserts commandName is GitCommandName {
  if (!isGitCommandName(commandName)) {
    throw new Error('Git command not allowed.');
  }
}

const assertSafeValue = (value: string, label: string): void => {
  if (!value || value.startsWith('-')) {
    throw new Error(`Invalid ${label}.`);
  }
};

const assertCommitHash = (value: string, label = 'commit hash'): void => {
  if (!COMMIT_HASH_RE.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
};

const assertSafeRemoteUrl = (value: string): void => {
  assertSafeValue(value, 'remote URL');
  if (/^[a-z][a-z0-9+.-]*::/i.test(value)) {
    throw new Error('Git remote-helper URLs are not allowed.');
  }
};

const assertAllOptions = (args: string[], allowed: ReadonlySet<string>, commandName: GitCommandName): void => {
  for (const arg of args) {
    if (!allowed.has(arg)) {
      throw new Error(`Unsupported argument for git ${commandName}.`);
    }
  }
};

const splitPathspecTail = (args: string[], commandName: GitCommandName): { before: string[]; paths: string[] } => {
  const separator = args.indexOf('--');
  if (separator < 0) return { before: args, paths: [] };
  if (!PATHSPEC_COMMANDS.has(commandName)) {
    throw new Error(`Pathspec separator is not supported for git ${commandName}.`);
  }
  const paths = args.slice(separator + 1);
  if (paths.length === 0) {
    throw new Error('At least one repository-relative path is required after --.');
  }
  paths.forEach((filePath) => normalizeRepositoryRelativePath(filePath, 'Pathspec'));
  return { before: args.slice(0, separator), paths };
};

const normalizeLiteralPathspecTail = (args: string[], commandName: GitCommandName): string[] => {
  const separator = args.indexOf('--');
  if (separator < 0 || !PATHSPEC_COMMANDS.has(commandName)) return args;
  return [...args.slice(0, separator + 1), ...args.slice(separator + 1).map((filePath) => toLiteralPathspec(filePath, 'Pathspec'))];
};

const validateLogArgs = (args: string[]): void => {
  if (args.length >= 1) {
    const parsedLimit = Number(args[0]);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 5000) {
      throw new Error('Invalid log limit.');
    }
  }
  if (args.length >= 2 && args[1] !== 'all' && args[1] !== 'head') {
    throw new Error('Invalid log scope.');
  }
  if (args.length >= 3) {
    const parsedOffset = Number(args[2]);
    if (!Number.isFinite(parsedOffset) || parsedOffset < 0 || parsedOffset > 50000) {
      throw new Error('Invalid log offset.');
    }
  }
};

const validateReflogArgs = (args: string[]): void => {
  if (args.length < 1) return;
  const parsedLimit = Number(args[0]);
  if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
    throw new Error('Invalid reflog limit.');
  }
};

const validateForensicHistoryArgs = (args: string[]): void => {
  const [searchType, targetPath, searchTerm = '', startRaw, endRaw, limitRaw = '200'] = args;
  if (!searchType || !['string', 'regex', 'line'].includes(searchType)) {
    throw new Error('Invalid forensic search type.');
  }
  normalizeRepositoryRelativePath(targetPath, 'Forensic path');
  const parsedLimit = Number(limitRaw);
  if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
    throw new Error('Invalid forensic limit.');
  }
  if (searchType === 'line') {
    const parsedStart = Number(startRaw);
    const parsedEnd = Number(endRaw);
    if (!Number.isFinite(parsedStart) || parsedStart < 1) throw new Error('Invalid forensic start line.');
    if (!Number.isFinite(parsedEnd) || parsedEnd < parsedStart) throw new Error('Invalid forensic end line.');
    return;
  }
  if (!searchTerm) throw new Error('Forensic search term is required.');
};

const validateStatusArgs = (args: string[]): void => {
  assertAllOptions(args, new Set(['-s', '--short', '--branch', '--porcelain=v1', '--porcelain=v2']), 'status');
};

const validateBranchArgs = (args: string[]): void => {
  if (args.length === 1 && ['-a', '-r'].includes(args[0])) return;
  if (args.length === 2 && ['-d', '-D'].includes(args[0])) {
    assertSafeValue(args[1], 'branch name');
    return;
  }
  if (args.length === 3 && ['-m', '-M'].includes(args[0])) {
    assertSafeValue(args[1], 'branch name');
    assertSafeValue(args[2], 'branch name');
    return;
  }
  if (args.length === 3 && args[0] === '--set-upstream-to') {
    assertSafeValue(args[1], 'upstream branch');
    assertSafeValue(args[2], 'branch name');
    return;
  }
  throw new Error('Unsupported argument combination for git branch.');
};

const validateRemoteArgs = (args: string[]): void => {
  if (args.length === 0 || (args.length === 1 && args[0] === '-v')) return;
  const [action, ...values] = args;
  const expectedCounts: Record<string, number> = { 'get-url': 1, add: 2, remove: 1, rename: 2, 'set-url': 2 };
  if (!(action in expectedCounts) || values.length !== expectedCounts[action]) {
    throw new Error('Unsupported argument combination for git remote.');
  }
  values.forEach((value) => assertSafeValue(value, 'remote name'));
  if (action === 'add' || action === 'set-url') {
    assertSafeRemoteUrl(values[1]);
  }
};

const validateTagArgs = (args: string[]): void => {
  if (args.length === 1 && args[0] === '-l') return;
  if (args.length === 2 && args[0] === '-l' && args[1] === '--sort=-v:refname') return;
  if (args.length === 2 && args[0] === '-d') {
    assertSafeValue(args[1], 'tag name');
    return;
  }
  if (args[0] === '-a' && (args.length === 4 || args.length === 5) && args[2] === '-m') {
    assertSafeValue(args[1], 'tag name');
    if (args.length === 5) assertSafeValue(args[4], 'tag target');
    return;
  }
  if ((args.length === 1 || args.length === 2) && !args[0].startsWith('-')) {
    args.forEach((value, index) => assertSafeValue(value, index === 0 ? 'tag name' : 'tag target'));
    return;
  }
  throw new Error('Unsupported argument combination for git tag.');
};

const validateFetchArgs = (args: string[]): void => {
  const options = args.filter((arg) => arg.startsWith('-'));
  assertAllOptions(options, new Set(['--all', '--prune', '--tags', '--quiet']), 'fetch');
  const values = args.filter((arg) => !arg.startsWith('-'));
  if (values.length > 2 || (options.includes('--all') && values.length > 0)) {
    throw new Error('Unsupported argument combination for git fetch.');
  }
  if (values[0]) assertSafeRemoteUrl(values[0]);
  if (values[1]) assertSafeValue(values[1], 'refspec');
};

const validatePullArgs = (args: string[]): void => {
  assertAllOptions(args, new Set(['--rebase', '--ff-only', '--no-ff', '--autostash']), 'pull');
};

const validatePushArgs = (args: string[]): void => {
  const options = args.filter((arg) => arg.startsWith('-'));
  if (
    options.some(
      (arg) =>
        arg !== '--force-with-lease' &&
        !arg.startsWith('--force-with-lease=') &&
        arg !== '--tags' &&
        arg !== '--follow-tags' &&
        arg !== '-u' &&
        arg !== '--set-upstream',
    )
  ) {
    throw new Error('Unsupported argument for git push.');
  }
  const values = args.filter((arg) => !arg.startsWith('-'));
  if (values.length > 2 || (options.includes('--tags') && values.length > 0)) {
    throw new Error('Unsupported argument combination for git push.');
  }
  if (values[0]) assertSafeRemoteUrl(values[0]);
  if (values[1]) assertSafeValue(values[1], 'push ref');
};

const validateCheckoutArgs = (args: string[]): void => {
  const { before, paths } = splitPathspecTail(args, 'checkout');
  if (paths.length > 0) {
    if (before.length === 0 || (before.length === 1 && ['--ours', '--theirs'].includes(before[0])) || (before.length === 1 && !before[0].startsWith('-')))
      return;
    throw new Error('Unsupported argument combination for git checkout.');
  }
  if (before.length === 1 && !before[0].startsWith('-')) return;
  if (before.length >= 2 && before.length <= 3 && ['-b', '-B'].includes(before[0])) {
    assertSafeValue(before[1], 'branch name');
    if (before.length === 3) assertSafeValue(before[2], 'checkout target');
    return;
  }
  if (before.length === 2 && before[0] === '--track') {
    assertSafeValue(before[1], 'remote branch');
    return;
  }
  if (before.length === 4 && before[0] === '-b' && before[2] === '--track') {
    assertSafeValue(before[1], 'branch name');
    assertSafeValue(before[3], 'remote branch');
    return;
  }
  throw new Error('Unsupported argument combination for git checkout.');
};

const validateCommitArgs = (args: string[]): void => {
  let messageCount = 0;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (['--amend', '--signoff', '--allow-empty'].includes(arg)) continue;
    if (arg === '-m' || arg === '--message') {
      if (!args[index + 1]) throw new Error('Commit message is required.');
      messageCount += 1;
      index += 1;
      continue;
    }
    throw new Error('Unsupported argument for git commit.');
  }
  if (messageCount === 0) throw new Error('Commit message is required.');
};

const validateResetArgs = (args: string[]): void => {
  const { before, paths } = splitPathspecTail(args, 'reset');
  if (paths.length > 0) {
    if (before.length === 0 || (before.length === 1 && before[0] === 'HEAD')) return;
    throw new Error('Unsupported argument combination for git reset.');
  }
  if (before.length === 1 && before[0] === 'HEAD') return;
  if (before.length === 2 && ['--soft', '--mixed', '--hard'].includes(before[0])) {
    assertCommitHash(before[1]);
    return;
  }
  throw new Error('Unsupported argument combination for git reset.');
};

const validateStashArgs = (args: string[]): void => {
  const { before, paths } = splitPathspecTail(args, 'stash');
  if (paths.length > 0) {
    if (before[0] !== 'push') throw new Error('Unsupported stash pathspec operation.');
    let index = 1;
    if (before[index] === '-u' || before[index] === '--include-untracked') index += 1;
    if (before[index] === '-m') {
      if (!before[index + 1]) throw new Error('Stash message is required.');
      index += 2;
    }
    if (index === before.length) return;
    throw new Error('Unsupported argument combination for git stash.');
  }
  if (before.length === 1 && before[0] === 'pop') return;
  if (before.length === 2 && ['apply', 'pop', 'drop'].includes(before[0]) && STASH_REF_RE.test(before[1])) return;
  if (before.length === 4 && before[0] === 'show' && before[1] === '-u' && before[2] === '--name-only' && STASH_REF_RE.test(before[3])) return;
  if ((before.length === 3 || before.length === 4) && before[0] === 'push') {
    const offset = before[1] === '-u' || before[1] === '--include-untracked' ? 1 : 0;
    if (before.length === 3 + offset && before[1 + offset] === '-m' && before[2 + offset]) return;
  }
  throw new Error('Unsupported argument combination for git stash.');
};

const validateDiffArgs = (args: string[]): void => {
  const { before } = splitPathspecTail(args, 'diff');
  const options = before.filter((arg) => arg.startsWith('-'));
  if (options.some((arg) => !['--numstat', '--cached', '--name-status', '--stat', '--no-color'].includes(arg) && !/^--unified=\d+$/.test(arg))) {
    throw new Error('Unsupported argument for git diff.');
  }
  const refs = before.filter((arg) => !arg.startsWith('-'));
  if (refs.length > 2) throw new Error('Unsupported argument combination for git diff.');
  refs.forEach((ref) => assertSafeValue(ref, 'diff revision'));
};

const validateShowArgs = (args: string[]): void => {
  const { before } = splitPathspecTail(args, 'show');
  const options = before.filter((arg) => arg.startsWith('-'));
  if (options.some((arg) => !['-s', '--quiet', '--name-status'].includes(arg) && !arg.startsWith('--format='))) {
    throw new Error('Unsupported argument for git show.');
  }
  const refs = before.filter((arg) => !arg.startsWith('-'));
  if (refs.length > 1) throw new Error('Unsupported argument combination for git show.');
  refs.forEach((ref) => assertSafeValue(ref, 'show revision'));
};

const validateAddArgs = (args: string[]): void => {
  const { before, paths } = splitPathspecTail(args, 'add');
  if (paths.length > 0 && before.length === 0) return;
  if (paths.length === 0 && before.length === 1 && ['-A', '--all', '.'].includes(before[0])) return;
  throw new Error('Unsupported argument combination for git add.');
};

const validateMergeArgs = (args: string[]): void => {
  const options = args.filter((arg) => arg.startsWith('-'));
  assertAllOptions(options, new Set(['--no-ff', '--ff-only', '--squash', '--no-commit']), 'merge');
  const refs = args.filter((arg) => !arg.startsWith('-'));
  if (refs.length !== 1) throw new Error('A merge target is required.');
  assertSafeValue(refs[0], 'merge target');
};

const validateRevertArgs = (args: string[]): void => {
  const values = args.filter((arg) => !arg.startsWith('-'));
  if (values.length < 1 || values.length > 2) throw new Error('Invalid revert arguments.');
  const hash = values[values.length - 1];
  assertCommitHash(hash);
  if (args.includes('-m')) {
    const mainline = args[args.indexOf('-m') + 1];
    if (!/^[1-9]\d*$/.test(mainline || '')) throw new Error('Invalid revert mainline.');
  }
  if (args.some((arg) => ![hash, '-m', args[args.indexOf('-m') + 1], '--no-edit'].includes(arg))) {
    throw new Error('Unsupported argument for git revert.');
  }
};

// eslint-disable-next-line complexity -- The exhaustive IPC allowlist is intentionally expressed as one command switch.
const validateCommandSpecificArgs = (commandName: GitCommandName, args: string[]): void => {
  switch (commandName) {
    case 'status':
      return validateStatusArgs(args);
    case 'log':
      return validateLogArgs(args);
    case 'branches':
    case 'statusPorcelain':
    case 'mergeContinue':
    case 'mergeAbort':
    case 'rebaseContinue':
    case 'rebaseAbort':
    case 'cherryPickContinue':
    case 'cherryPickAbort':
    case 'submoduleStatus':
    case 'submoduleUpdateInitRecursive':
    case 'submoduleSyncRecursive':
      if (args.length > 0) throw new Error(`git ${commandName} does not accept arguments.`);
      return;
    case 'commitDetails':
      if (args.length !== 1) throw new Error('A commit hash is required.');
      return assertCommitHash(args[0]);
    case 'conflictTakeOurs':
    case 'conflictTakeTheirs':
    case 'conflictTakeDeleted':
    case 'conflictMarkResolved':
      if (args.length !== 1) throw new Error('A repository-relative file path is required.');
      return void normalizeRepositoryRelativePath(args[0]);
    case 'branch':
      return validateBranchArgs(args);
    case 'remote':
      return validateRemoteArgs(args);
    case 'tag':
      return validateTagArgs(args);
    case 'fetch':
      return validateFetchArgs(args);
    case 'pull':
      return validatePullArgs(args);
    case 'push':
      return validatePushArgs(args);
    case 'checkout':
      return validateCheckoutArgs(args);
    case 'commit':
      return validateCommitArgs(args);
    case 'reset':
      return validateResetArgs(args);
    case 'clean': {
      const { before } = splitPathspecTail(args, 'clean');
      return assertAllOptions(before, new Set(['-f', '-d', '-x', '-X']), 'clean');
    }
    case 'stash':
      return validateStashArgs(args);
    case 'diff':
      return validateDiffArgs(args);
    case 'show':
      return validateShowArgs(args);
    case 'add':
      return validateAddArgs(args);
    case 'cherry-pick':
      if (args.length !== 1) throw new Error('A commit hash is required.');
      return assertCommitHash(args[0]);
    case 'revert':
      return validateRevertArgs(args);
    case 'merge':
      return validateMergeArgs(args);
    case 'reflog':
      return validateReflogArgs(args);
    case 'forensicHistory':
      return validateForensicHistoryArgs(args);
  }
};

export function validateCommandArgs(commandName: GitCommandName, args: string[]): void {
  const max = MAX_ARGS_BY_GIT_COMMAND[commandName];
  if (typeof max === 'number' && args.length > max) {
    throw new Error('Too many args for git ' + commandName + '.');
  }
  validateCommandSpecificArgs(commandName, args);
}

/** Validates IPC arguments and converts every accepted pathspec to literal mode. */
export function normalizeCommandArgs(commandName: GitCommandName, rawArgs: unknown[]): string[] {
  const args = normalizeArgs(rawArgs);
  validateCommandArgs(commandName, args);
  return normalizeLiteralPathspecTail(args, commandName);
}
