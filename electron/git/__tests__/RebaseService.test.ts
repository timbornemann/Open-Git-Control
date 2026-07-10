import { describe, expect, it } from 'vitest';
import { normalizeInteractiveRebaseTodo } from '../RebaseService';

describe('normalizeInteractiveRebaseTodo', () => {
  it('keeps only supported interactive rebase actions', () => {
    expect(normalizeInteractiveRebaseTodo(['pick AAAAAAA add feature', 'reword bbbbbbb improve message', 'drop ccccccc remove experiment'])).toEqual([
      'pick aaaaaaa add feature',
      'reword bbbbbbb improve message',
      'drop ccccccc remove experiment',
    ]);
  });

  it('rejects exec and other directives that the Git todo interpreter could execute', () => {
    expect(() => normalizeInteractiveRebaseTodo(['exec powershell -Command Remove-Item'])).toThrow('Unsupported rebase todo instruction');
    expect(() => normalizeInteractiveRebaseTodo(['pick aaaaaaa safe', 'break'])).toThrow('Unsupported rebase todo instruction');
  });
});
