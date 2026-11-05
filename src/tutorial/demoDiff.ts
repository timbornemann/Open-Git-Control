import { quotePatchPath } from '@/shared/diff/selectedPatch';
import { demoGitText, sameDemoBlob, isDemoGitlink, type DemoBlob } from './demoBlob';

export type DemoTextLine = { text: string; newline: boolean };
export const demoTextLines = (text: string | undefined): DemoTextLine[] => {
  if (!text) return [];
  const parts = text.split('\n');
  const terminated = parts.at(-1) === '';
  if (terminated) parts.pop();
  return parts.map((line, index) => ({ text: line, newline: terminated || index < parts.length - 1 }));
};
export const sameDemoLine = (left: DemoTextLine, right: DemoTextLine) => left.text === right.text && left.newline === right.newline;
export type DemoLineEdit = DemoTextLine & { kind: ' ' | '+' | '-' };

/** Small bundled files use LCS; cap its matrix for exploratory large edits. */
export function demoLineEdits(before: DemoTextLine[], after: DemoTextLine[]): DemoLineEdit[] {
  if ((before.length + 1) * (after.length + 1) > 1_000_000)
    return [...before.map((line): DemoLineEdit => ({ ...line, kind: '-' })), ...after.map((line): DemoLineEdit => ({ ...line, kind: '+' }))];
  const lengths = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
  for (let left = before.length - 1; left >= 0; left--)
    for (let right = after.length - 1; right >= 0; right--)
      lengths[left][right] = sameDemoLine(before[left], after[right])
        ? 1 + lengths[left + 1][right + 1]
        : Math.max(lengths[left + 1][right], lengths[left][right + 1]);
  const result: DemoLineEdit[] = [];
  let left = 0,
    right = 0;
  while (left < before.length || right < after.length) {
    if (left < before.length && right < after.length && sameDemoLine(before[left], after[right])) {
      result.push({ ...before[left++], kind: ' ' });
      right++;
    } else if (left < before.length && (right === after.length || lengths[left + 1][right] >= lengths[left][right + 1]))
      result.push({ ...before[left++], kind: '-' });
    else result.push({ ...after[right++], kind: '+' });
  }
  return result;
}

/** Deterministic unified patches, with separate hunks and final-newline markers. */
export function demoTextDiff(path: string, oldBlob: DemoBlob | undefined, newBlob: DemoBlob | undefined) {
  if (sameDemoBlob(oldBlob, newBlob)) return '';
  const before = demoGitText(oldBlob),
    after = demoGitText(newBlob);
  if (before?.includes('\0') || after?.includes('\0'))
    return `diff --git ${quotePatchPath('a/' + path)} ${quotePatchPath('b/' + path)}\nBinary files ${before === undefined ? '/dev/null' : quotePatchPath('a/' + path)} and ${after === undefined ? '/dev/null' : quotePatchPath('b/' + path)} differ\n`;
  const script = demoLineEdits(demoTextLines(before), demoTextLines(after));
  const changes = script.flatMap((line, index) => (line.kind === ' ' ? [] : [index]));
  const groups: Array<{ start: number; end: number }> = [];
  for (const index of changes) {
    const start = Math.max(0, index - 3),
      end = Math.min(script.length, index + 4);
    const previous = groups.at(-1);
    if (previous && start <= previous.end) previous.end = end;
    else groups.push({ start, end });
  }
  const oldPath = quotePatchPath('a/' + path),
    newPath = quotePatchPath('b/' + path);
  const patch = [`diff --git ${oldPath} ${newPath}`];
  const mode = isDemoGitlink(oldBlob) || isDemoGitlink(newBlob) ? '160000' : '100644';
  if (before === undefined) patch.push('new file mode ' + mode);
  else if (after === undefined) patch.push('deleted file mode ' + mode);
  const oldId = isDemoGitlink(oldBlob) ? oldBlob.gitlink.slice(0, 7) : before === undefined ? '0000000' : '1111111';
  const newId = isDemoGitlink(newBlob) ? newBlob.gitlink.slice(0, 7) : after === undefined ? '0000000' : '2222222';
  patch.push(`index ${oldId}..${newId} ${mode}`, `--- ${before === undefined ? '/dev/null' : oldPath}`, `+++ ${after === undefined ? '/dev/null' : newPath}`);
  for (const { start, end } of groups) {
    const preceding = script.slice(0, start),
      block = script.slice(start, end);
    const oldCount = block.filter((line) => line.kind !== '+').length,
      newCount = block.filter((line) => line.kind !== '-').length;
    const oldStart = preceding.filter((line) => line.kind !== '+').length + (oldCount ? 1 : 0);
    const newStart = preceding.filter((line) => line.kind !== '-').length + (newCount ? 1 : 0);
    patch.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const line of block) {
      patch.push(line.kind + line.text);
      if (!line.newline) patch.push('\\ No newline at end of file');
    }
  }
  return patch.join('\n') + '\n';
}
