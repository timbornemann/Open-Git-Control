import { describe, expect, it } from 'vitest';
import { assertAllowedGitCommand, normalizeArgs, validateCommandArgs } from '../gitCommandPolicy';

describe('gitCommandPolicy', () => {
  it('allows known command names', () => {
    expect(() => assertAllowedGitCommand('status')).not.toThrow();
    expect(() => assertAllowedGitCommand('forensicHistory')).not.toThrow();
  });

  it('rejects unknown command names', () => {
    expect(() => assertAllowedGitCommand('rm')).toThrow('Git command not allowed.');
  });

  it('normalizes valid args and rejects control characters', () => {
    expect(normalizeArgs(['main', '--all'])).toEqual(['main', '--all']);
    expect(() => normalizeArgs(['ok\nbad'])).toThrow('Control characters are not allowed in git arguments.');
  });

  it('validates bounded log arguments', () => {
    expect(() => validateCommandArgs('log', ['50', 'all', '0'])).not.toThrow();
    expect(() => validateCommandArgs('log', ['0', 'all', '0'])).toThrow('Invalid log limit.');
    expect(() => validateCommandArgs('log', ['50', 'invalid-scope', '0'])).toThrow('Invalid log scope.');
  });

  it('allows commit args produced by amend/signoff/title/body UI combinations', () => {
    expect(() => validateCommandArgs('commit', ['--amend', '--signoff', '-m', 'Title', '-m', 'Body'])).not.toThrow();
  });

  it('validates forensic line range queries', () => {
    expect(() => validateCommandArgs('forensicHistory', ['line', 'src/App.tsx', '', '10', '20', '100'])).not.toThrow();
    expect(() => validateCommandArgs('forensicHistory', ['line', 'src/App.tsx', '', '20', '10', '100'])).toThrow('Invalid forensic end line.');
  });
});
