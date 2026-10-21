import { describe, expect, it } from 'vitest';
import { parseDiff } from './parser';
import { diffSelectionBlockReason, diffSelectionUnits, pairedDiffRows, toggleDiffSelection } from './lineSelection';
import { quotePatchPath } from './selectedPatch';

describe('shared line selection model', () => {
  it('C-quotes paths including Unicode, tabs, quotes, backslashes and control characters', () => {
    expect(quotePatchPath('a/ä file\t"\\\x1f.txt')).toBe('"a/ä file\\011\\"\\\\\\037.txt"');
  });
  it('pairs replacements and leaves unequal additions separately selectable', () => {
    const parsed = parseDiff('@@ -1,3 +1,4 @@\n-old\n+new\n+extra\n keep\n tail\n');
    const units = diffSelectionUnits(parsed);
    expect(units.map((unit) => unit.rowIndices)).toEqual([[0, 1], [2]]);
    const rows = pairedDiffRows(parsed.hunks[0]);
    expect(rows[0]).toMatchObject({ selectionId: units[0].id, left: { text: 'old' }, right: { text: 'new' } });
    expect(rows[1]).toMatchObject({ selectionId: units[1].id, left: null, right: { text: 'extra' } });
    expect(diffSelectionBlockReason(parsed, '')).toBe(null);
  });
  it('keeps pure additions and control characters in their original side-by-side cell', () => {
    const parsed = parseDiff('@@ -0,0 +1,1 @@\n+new\x1ftext\n');
    expect(pairedDiffRows(parsed.hunks[0])[0]).toMatchObject({ left: null, right: { text: 'new\x1ftext' } });
  });
  it('does not pair across context and does not invent a final empty context line', () => {
    const parsed = parseDiff('@@ -1,3 +1,3 @@\n-one\n keep\n+two\n tail\n');
    expect(parsed.hunks[0].rows).toHaveLength(4);
    expect(diffSelectionUnits(parsed).map((unit) => unit.rowIndices)).toEqual([[0], [2]]);
  });
  it('detects malformed counts, truncated raw lines and combined or special-mode diffs', () => {
    for (const text of [
      '@@ -1,2 +1,2 @@\n-old\n+new',
      '@@@ -1 -1 +1 @@@\n++conflict',
      'new file mode 160000\n@@ -0,0 +1,1 @@\n+Subproject commit a',
      '@@ -1 +1 @@\n-old\n+new\nbad',
    ])
      expect(diffSelectionBlockReason(parseDiff(text), text)).not.toBe(null);
  });
  it('applies range toggles in either direction, with unknown anchors falling back to a single unit', () => {
    const ids = ['one', 'two', 'three'];
    expect([...toggleDiffSelection(ids, new Set(['three']), 'three', 'one', true)]).toEqual(['three', 'one', 'two']);
    expect([...toggleDiffSelection(ids, new Set(ids), 'three', 'one', true)]).toEqual([]);
    expect([...toggleDiffSelection(ids, new Set(), 'missing', 'two', true)]).toEqual(['two']);
  });
});
