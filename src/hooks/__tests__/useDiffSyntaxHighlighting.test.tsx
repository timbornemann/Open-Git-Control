import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { highlightDiffLine } from '../useDiffSyntaxHighlighting';

const tokens = (nodes: ReactNode[]) =>
  nodes.map((node) => (isValidElement<{ className: string; children: string }>(node) ? [node.props.className, node.props.children] : ['text', String(node)]));

describe('highlightDiffLine', () => {
  it('highlights strings, comments, keywords and calls', () => {
    expect(tokens(highlightDiffLine('const a = "it\\"s"; // done'))).toEqual([
      ['hl-keyword', 'const'],
      ['text', ' a = '],
      ['hl-string', '"it\\"s"'],
      ['text', '; '],
      ['hl-comment', '// done'],
    ]);
    expect(tokens(highlightDiffLine("don't call(x)"))).toEqual([
      ['text', "don't "],
      ['hl-function', 'call'],
      ['text', '(x)'],
    ]);
    expect(tokens(highlightDiffLine('/** opens a block comment'))).toEqual([['hl-comment', '/** opens a block comment']]);
  });

  it('stays linear for crafted lines with unterminated strings and comments', () => {
    const lines = ['"\\'.repeat(128 * 1024), "'\\".repeat(128 * 1024), '`\\'.repeat(128 * 1024), 'a/*'.repeat(85 * 1024)];
    const startedAt = Date.now();
    for (const line of lines) expect(highlightDiffLine(line).join('').length).toBeGreaterThan(0);
    // The previous expression needed minutes for these lines.
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });
});
