import { describe, expect, it } from 'vitest';
import { formatCommitSubject, parseCommitSubject } from '../commitSubject';

describe('structured commit subjects', () => {
  it.each([
    ['fix', ' backend ', ' repair login ', 'fix(backend): repair login'],
    ['docs', '', 'update guide', 'docs: update guide'],
    ['', '', 'ordinary message', 'ordinary message'],
    ['', 'Quick note:', 'ordinary message', 'Quick note: ordinary message'],
    ['', 'prefix only', '', 'prefix only'],
    ['perf', 'graph', '  ', ''],
  ] as const)('formats %s with optional scope or plain prefix', (type, scope, message, expected) => {
    expect(formatCommitSubject({ type, scope, message })).toBe(expected);
  });

  it('splits known types when importing AI, amend or template subjects', () => {
    expect(parseCommitSubject('fix(backend): repair login')).toEqual({ type: 'fix', scope: 'backend', message: 'repair login' });
    expect(parseCommitSubject('add: new icon')).toEqual({ type: 'add', scope: '', message: 'new icon' });
  });

  it.each(['ordinary message', 'custom(scope): keep this', 'feat(core)!: breaking change', 'fix:message without separator', 'docs: first\nsecond'])(
    'preserves an arbitrary imported subject: %s',
    (title) => {
      expect(parseCommitSubject(title)).toEqual({ type: '', scope: '', message: title });
      expect(formatCommitSubject(parseCommitSubject(title))).toBe(title);
    },
  );
});
