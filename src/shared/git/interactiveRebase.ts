const REBASE_TODO_ACTIONS = new Set(['pick', 'reword', 'edit', 'squash', 'fixup', 'drop']);
export const COMMIT_HASH_RE = /^[0-9a-f]{7,64}$/i;
const MAX_REBASE_TODO_LINES = 500;
const MAX_REBASE_TODO_LINE_LENGTH = 1_000;

/**
 * The interactive editor accepts commands such as `exec`, which can execute
 * arbitrary shell programs. The UI intentionally supports only commit
 * reordering/editing actions, so reject every other todo instruction here.
 */
export function normalizeInteractiveRebaseTodo(todoLines: unknown): string[] {
  if (!Array.isArray(todoLines) || todoLines.length === 0) {
    throw new Error('Rebase todo list is empty.');
  }
  if (todoLines.length > MAX_REBASE_TODO_LINES) {
    throw new Error(`Rebase todo list must not contain more than ${MAX_REBASE_TODO_LINES} lines.`);
  }

  return todoLines.map((value, index) => {
    if (typeof value !== 'string') {
      throw new Error(`Invalid rebase todo line ${index + 1}.`);
    }
    const line = value.trim();
    if (!line || line.length > MAX_REBASE_TODO_LINE_LENGTH || /[\0\r\n]/.test(line)) {
      throw new Error(`Invalid rebase todo line ${index + 1}.`);
    }

    const match = line.match(/^(pick|reword|edit|squash|fixup|drop)\s+([0-9a-f]{7,64})(?:\s+(.*))?$/i);
    if (!match || !REBASE_TODO_ACTIONS.has(match[1].toLowerCase()) || !COMMIT_HASH_RE.test(match[2])) {
      throw new Error(`Unsupported rebase todo instruction on line ${index + 1}.`);
    }

    const action = match[1].toLowerCase();
    const hash = match[2].toLowerCase();
    const subject = (match[3] || '').trim();
    if (action === 'reword' && !subject) {
      throw new Error(`Reword instruction on line ${index + 1} requires a replacement subject.`);
    }
    return subject ? `${action} ${hash} ${subject}` : `${action} ${hash}`;
  });
}
