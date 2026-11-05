import type { DemoCommit, DemoRepository } from './demoRepository';
import { demoAncestors, demoCommitChanges, resolveDemoCommit } from './demoHistory';
import { demoGitText, getDemoBlob } from './demoBlob';
import { demoLineEdits, demoTextLines, type DemoLineEdit } from './demoDiff';

type Change = { oldStart: number; oldEnd: number; newStart: number; newEnd: number };
function changedRanges(edits: DemoLineEdit[]): Change[] {
  const changes: Change[] = [];
  let oldLine = 0,
    newLine = 0,
    change: Change | undefined;
  for (const edit of edits) {
    if (edit.kind === ' ') {
      if (change) {
        changes.push(change);
        change = undefined;
      }
      oldLine++;
      newLine++;
    } else {
      change ||= { oldStart: oldLine, oldEnd: oldLine, newStart: newLine, newEnd: newLine };
      if (edit.kind === '-') oldLine++;
      else newLine++;
      change.oldEnd = oldLine;
      change.newEnd = newLine;
    }
  }
  if (change) changes.push(change);
  return changes;
}
function previousPosition(position: number, end: boolean, changes: Change[]) {
  let delta = 0;
  for (const change of changes) {
    if (position < change.newStart) break;
    if (position === change.newStart && end) return change.oldStart;
    if (position >= change.newEnd) {
      delta += change.oldEnd - change.oldStart - (change.newEnd - change.newStart);
      continue;
    }
    return end ? change.oldEnd : change.oldStart;
  }
  return position + delta;
}
const textLines = (text: string | undefined) => {
  if (text?.includes('\0')) throw new Error('Der Zeilenverlauf benötigt eine Textdatei. / Line history requires a text file.');
  if ((text?.length || 0) > 2_000_000)
    throw new Error('Diese Beispieldatei ist für den Übungs-Zeilenverlauf zu groß. / This sample file is too large for practice line history.');
  return demoTextLines(text);
};
/** Track the selected HEAD lines backwards through edits and exact renames. */
export function demoLineHistory(repo: DemoRepository, path: string, start: number, end: number, limit = 200): DemoCommit[] {
  const head = demoAncestors(repo);
  const blob = getDemoBlob(head[0]?.files || {}, path);
  if (blob === undefined) throw new Error('Die Datei fehlt im aktuellen Commit. / The file is absent in the current commit.');
  const lines = textLines(demoGitText(blob));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > lines.length)
    throw new Error('Ungültiger Zeilenbereich für diese Datei. / Invalid line range for this file.');
  const matches: DemoCommit[] = [];
  let from = start - 1,
    to = end,
    currentPath = path;
  for (const commit of head) {
    const parents = commit.parent.split(/\s+/).filter(Boolean);
    if (parents.length > 1)
      throw new Error('Diese Merge-Historie wird in dieser Übung nicht unterstützt. / This merge history is not supported in this exercise.');
    const parent = parents.length ? resolveDemoCommit(repo, parents[0]) : undefined;
    const renamed = demoCommitChanges(repo, commit).find((change) => change.path === currentPath && change.status === 'R');
    const previousPath = renamed?.previousPath || currentPath;
    const beforeText = demoGitText(getDemoBlob(parent?.files || {}, previousPath));
    const afterText = demoGitText(getDemoBlob(commit.files || {}, currentPath));
    if (beforeText !== afterText) {
      const before = textLines(beforeText),
        after = textLines(afterText);
      if ((before.length + 1) * (after.length + 1) > 1_000_000)
        throw new Error('Dieser Vergleich ist für den Übungs-Zeilenverlauf zu groß. / This comparison is too large for practice line history.');
      const changes = changedRanges(demoLineEdits(before, after));
      if (
        changes.some((change) =>
          change.newStart === change.newEnd ? from < change.newStart && change.newStart < to : change.newStart < to && change.newEnd > from,
        )
      )
        matches.push(commit);
      const oldFrom = previousPosition(from, false, changes),
        oldTo = previousPosition(to, true, changes);
      from = oldFrom;
      to = oldTo;
    }
    currentPath = previousPath;
    if (from >= to || matches.length >= limit) break;
  }
  return matches;
}
