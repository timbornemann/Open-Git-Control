import { describe, expect, it } from 'vitest';
import { assertAllowedGitCommand, normalizeArgs, normalizeCommandArgs, validateCommandArgs } from '../gitCommandPolicy';

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

  it('rejects unapproved Git options that could alter the execution environment', () => {
    expect(() => validateCommandArgs('fetch', ['--upload-pack=cmd.exe'])).toThrow('Unsupported argument for git fetch.');
    expect(() => validateCommandArgs('show', ['--textconv', 'HEAD'])).toThrow('Unsupported argument for git show.');
    expect(() => validateCommandArgs('checkout', ['--orphan', 'unsafe'])).toThrow('Unsupported argument combination for git checkout.');
    expect(() => validateCommandArgs('remote', ['set-url', 'origin', 'ext::sh -c evil'])).toThrow('remote-helper URLs are not allowed');
    expect(() => validateCommandArgs('fetch', ['ext::sh -c evil'])).toThrow('remote-helper URLs are not allowed');
    expect(() => validateCommandArgs('push', ['ext::sh -c evil', 'HEAD'])).toThrow('remote-helper URLs are not allowed');
  });

  it('converts accepted IPC pathspecs to literal form, including filenames that resemble pathspec magic', () => {
    expect(normalizeCommandArgs('checkout', ['stash@{0}', '--', 'docs/[draft].md'])).toEqual(['stash@{0}', '--', ':(literal)docs/[draft].md']);
    expect(normalizeCommandArgs('clean', ['-f', '--', 'generated/[temp].txt'])).toEqual(['-f', '--', ':(literal)generated/[temp].txt']);
    expect(normalizeCommandArgs('stash', ['push', '--include-untracked', '-m', 'partial', '--', 'src/[draft].ts'])).toEqual([
      'push',
      '--include-untracked',
      '-m',
      'partial',
      '--',
      ':(literal)src/[draft].ts',
    ]);
    expect(normalizeCommandArgs('checkout', ['stash@{0}', '--', ':(glob)**/*.env'])).toEqual(['stash@{0}', '--', ':(literal):(glob)**/*.env']);
  });

  it('validates forensic line range queries', () => {
    expect(() => validateCommandArgs('forensicHistory', ['line', 'src/App.tsx', '', '10', '20', '100'])).not.toThrow();
    expect(() => validateCommandArgs('forensicHistory', ['line', 'src/App.tsx', '', '20', '10', '100'])).toThrow('Invalid forensic end line.');
  });
});
