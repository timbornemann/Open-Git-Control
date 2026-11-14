export const COMMIT_TYPES = ['feat', 'fix', 'docs', 'perf', 'add', 'refactor', 'style', 'test', 'build', 'ci', 'chore', 'revert', 'remove'] as const;
export type CommitType = '' | (typeof COMMIT_TYPES)[number];

export type CommitSubject = {
  type: CommitType;
  scope: string;
  message: string;
};

export const parseCommitSubject = (title: string): CommitSubject => {
  const match = /^([a-z]+)(?:\(([^()\r\n]+)\))?: (.*)$/.exec(title);
  if (match && COMMIT_TYPES.includes(match[1] as Exclude<CommitType, ''>)) {
    return { type: match[1] as CommitType, scope: match[2] || '', message: match[3] };
  }
  // Preserve arbitrary subjects (including custom types and breaking-change
  // markers) as plain text when importing a template, AI message or amend.
  return { type: '', scope: '', message: title };
};

export const formatCommitSubject = ({ type, scope, message }: CommitSubject): string => {
  if (!type) return [scope.trim(), message.trim()].filter(Boolean).join(' ');
  if (!message.trim()) return '';
  return `${type}${scope.trim() ? `(${scope.trim()})` : ''}: ${message.trim()}`;
};

/**
 * Splits a raw commit message (`git show --format=%B`) into subject and body.
 * Only the blank separator line(s) are dropped: a message whose second line is
 * not blank (as created by other tools) must keep that line in the body so
 * amending does not silently discard it.
 */
export const splitCommitMessage = (raw: string): { title: string; description: string } => {
  const lines = raw.replace(/\r\n?/g, '\n').trimEnd().split('\n');
  const [title = '', ...rest] = lines;
  while (rest.length > 0 && rest[0].trim() === '') rest.shift();
  return { title, description: rest.join('\n') };
};
