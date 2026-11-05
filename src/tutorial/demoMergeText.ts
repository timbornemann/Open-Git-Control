import { demoLineEdits, demoTextLines, sameDemoLine, type DemoTextLine } from './demoDiff';

type Edit = { start: number; end: number; lines: DemoTextLine[]; side: 'ours' | 'theirs' };
const text = (lines: readonly DemoTextLine[]) => lines.map((line) => line.text + (line.newline ? '\n' : '')).join('');
function edits(base: DemoTextLine[], next: DemoTextLine[], side: Edit['side']): Edit[] {
  const result: Edit[] = [];
  let position = 0,
    current: Edit | undefined;
  for (const line of demoLineEdits(base, next)) {
    if (line.kind === ' ') {
      current = undefined;
      position++;
    } else {
      if (!current) {
        current = { start: position, end: position, lines: [], side };
        result.push(current);
      }
      if (line.kind === '-') current.end = ++position;
      else current.lines.push({ text: line.text, newline: line.newline });
    }
  }
  return result;
}
function apply(base: DemoTextLine[], group: Edit[], start: number, end: number, side: Edit['side']) {
  const result: DemoTextLine[] = [];
  let cursor = start;
  for (const edit of group.filter((entry) => entry.side === side)) {
    result.push(...base.slice(cursor, edit.start), ...edit.lines);
    cursor = edit.end;
  }
  return [...result, ...base.slice(cursor, end)];
}
/** Three-way line edits for small example files; no native Git or network. */
export function mergeDemoText(baseText: string, oursText: string, theirsText: string, source = 'incoming') {
  const base = demoTextLines(baseText),
    ours = demoTextLines(oursText),
    theirs = demoTextLines(theirsText);
  if ((base.length + 1) * (Math.max(ours.length, theirs.length) + 1) > 1_000_000) throw new Error('This large text merge is not available in the exercise.');
  const pending = [...edits(base, ours, 'ours'), ...edits(base, theirs, 'theirs')].sort((left, right) => left.start - right.start || left.end - right.end);
  const output: string[] = [];
  const eol = [baseText, oursText, theirsText].every((value) => value.includes('\r\n') && !/(^|[^\r])\n/.test(value)) ? '\r\n' : '\n';
  const terminated = (value: string) => (!value || value.endsWith('\n') ? value : value + eol);
  let cursor = 0,
    conflicted = false;
  while (pending.length) {
    const first = pending.shift()!,
      group = [first];
    let end = first.end;
    while (pending[0] && pending[0].start <= end) {
      const next = pending.shift()!;
      group.push(next);
      end = Math.max(end, next.end);
    }
    output.push(text(base.slice(cursor, first.start)));
    const left = apply(base, group, first.start, end, 'ours'),
      right = apply(base, group, first.start, end, 'theirs');
    const sides = new Set(group.map((edit) => edit.side));
    if (sides.size === 1) output.push(text(sides.has('ours') ? left : right));
    else if (text(left) === text(right)) output.push(text(left));
    else {
      while (left.length && right.length && sameDemoLine(left[0], right[0])) {
        output.push(text([left.shift()!]));
        right.shift();
      }
      const suffix: DemoTextLine[] = [];
      while (left.length && right.length && sameDemoLine(left.at(-1)!, right.at(-1)!)) {
        suffix.unshift(left.pop()!);
        right.pop();
      }
      output.push('<<<<<<< HEAD' + eol, terminated(text(left)), '=======' + eol, terminated(text(right)), '>>>>>>> ' + source + eol, text(suffix));
      conflicted = true;
    }
    cursor = end;
  }
  output.push(text(base.slice(cursor)));
  return { text: output.join(''), conflicted };
}
