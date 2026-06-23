export type GitCommandName =
  | 'status'
  | 'statusPorcelain'
  | 'log'
  | 'branches'
  | 'commitDetails'
  | 'conflictTakeOurs'
  | 'conflictTakeTheirs'
  | 'conflictMarkResolved'
  | 'mergeContinue'
  | 'mergeAbort'
  | 'rebaseContinue'
  | 'rebaseAbort'
  | 'branch'
  | 'remote'
  | 'tag'
  | 'fetch'
  | 'pull'
  | 'push'
  | 'checkout'
  | 'commit'
  | 'reset'
  | 'clean'
  | 'stash'
  | 'diff'
  | 'show'
  | 'add'
  | 'cherry-pick'
  | 'revert'
  | 'merge'
  | 'submoduleStatus'
  | 'submoduleUpdateInitRecursive'
  | 'submoduleSyncRecursive'
  | 'reflog'
  | 'forensicHistory';

const ALLOWED_GIT_COMMANDS: Set<GitCommandName> = new Set([
  'status',
  'statusPorcelain',
  'log',
  'branches',
  'commitDetails',
  'conflictTakeOurs',
  'conflictTakeTheirs',
  'conflictMarkResolved',
  'mergeContinue',
  'mergeAbort',
  'rebaseContinue',
  'rebaseAbort',
  'branch',
  'remote',
  'tag',
  'fetch',
  'pull',
  'push',
  'checkout',
  'commit',
  'reset',
  'clean',
  'stash',
  'diff',
  'show',
  'add',
  'cherry-pick',
  'revert',
  'merge',
  'submoduleStatus',
  'submoduleUpdateInitRecursive',
  'submoduleSyncRecursive',
  'reflog',
  'forensicHistory',
]);

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
  if (typeof commandName !== 'string' || !ALLOWED_GIT_COMMANDS.has(commandName as GitCommandName)) {
    throw new Error('Git command not allowed.');
  }
}

export function validateCommandArgs(commandName: GitCommandName, args: string[]): void {
  const maxArgsByCommand: Partial<Record<GitCommandName, number>> = {
    status: 2,
    statusPorcelain: 0,
    log: 3,
    branches: 0,
    commitDetails: 1,
    conflictTakeOurs: 1,
    conflictTakeTheirs: 1,
    conflictMarkResolved: 1,
    mergeContinue: 0,
    mergeAbort: 0,
    rebaseContinue: 0,
    rebaseAbort: 0,
    fetch: 8,
    pull: 6,
    push: 8,
    branch: 4,
    remote: 4,
    tag: 6,
    checkout: 5,
    commit: 6,
    reset: 4,
    clean: 4,
    stash: 6,
    diff: 6,
    show: 6,
    add: 4,
    'cherry-pick': 3,
    revert: 5,
    merge: 4,
    submoduleStatus: 0,
    submoduleUpdateInitRecursive: 0,
    submoduleSyncRecursive: 0,
    reflog: 1,
    forensicHistory: 6,
  };

  const max = maxArgsByCommand[commandName];
  if (typeof max === 'number' && args.length > max) {
    throw new Error('Too many args for git ' + commandName + '.');
  }

  if (commandName === 'log' && args.length >= 1) {
    const parsedLimit = Number(args[0]);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 5000) {
      throw new Error('Invalid log limit.');
    }
  }

  if (commandName === 'log' && args.length >= 2) {
    const scope = args[1];
    if (scope !== 'all' && scope !== 'head') {
      throw new Error('Invalid log scope.');
    }
  }

  if (commandName === 'log' && args.length >= 3) {
    const parsedOffset = Number(args[2]);
    if (!Number.isFinite(parsedOffset) || parsedOffset < 0 || parsedOffset > 50000) {
      throw new Error('Invalid log offset.');
    }
  }

  if (commandName === 'reflog' && args.length >= 1) {
    const parsedLimit = Number(args[0]);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
      throw new Error('Invalid reflog limit.');
    }
  }

  if (commandName === 'forensicHistory') {
    const searchType = args[0];
    const targetPath = args[1];
    if (!searchType || !['string', 'regex', 'line'].includes(searchType)) {
      throw new Error('Invalid forensic search type.');
    }
    if (!targetPath) {
      throw new Error('Forensic path is required.');
    }

    const parsedLimit = Number(args[5] || '200');
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      throw new Error('Invalid forensic limit.');
    }

    if (searchType === 'line') {
      const parsedStart = Number(args[3]);
      const parsedEnd = Number(args[4]);
      if (!Number.isFinite(parsedStart) || parsedStart < 1) {
        throw new Error('Invalid forensic start line.');
      }
      if (!Number.isFinite(parsedEnd) || parsedEnd < parsedStart) {
        throw new Error('Invalid forensic end line.');
      }
    } else if (!args[2]) {
      throw new Error('Forensic search term is required.');
    }
  }
}
