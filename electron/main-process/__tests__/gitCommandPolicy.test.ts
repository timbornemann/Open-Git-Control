import { describe, expect, it } from 'vitest';
import { assertAllowedGitCommand, normalizeArgs, normalizeCommandArgs, validateCommandArgs } from '../gitCommandPolicy';

describe('gitCommandPolicy', () => {
  it('bounds cross-branch merges to two named branches, a known mode and full commit IDs', () => {
    const args = ['feature', 'main', 'default', 'a'.repeat(40), 'b'.repeat(40)];
    expect(normalizeCommandArgs('mergeIntoBranch', args)).toEqual(args);
    expect(() => normalizeCommandArgs('mergeIntoBranch', args.slice(0, 4))).toThrow('Invalid merge request');
    expect(() => normalizeCommandArgs('mergeIntoBranch', ['--force', ...args.slice(1)])).toThrow('Invalid source branch');
    expect(() => normalizeCommandArgs('mergeIntoBranch', [...args.slice(0, 2), '--strategy=ours', ...args.slice(3)])).toThrow('Invalid merge request');
    expect(() => normalizeCommandArgs('mergeIntoBranch', [...args.slice(0, 3), 'HEAD', args[4]])).toThrow('Full branch commit IDs');
    expect(() => normalizeCommandArgs('mergeIntoBranch', [...args, '--force'])).toThrow('Too many args');
  });
  it('allows explicit merge pulls and no-fast-forward without rebase', () => {
    expect(() => validateCommandArgs('pull', ['--no-rebase'])).not.toThrow();
    expect(() => validateCommandArgs('pull', ['--no-rebase', '--no-ff'])).not.toThrow();
    expect(() => validateCommandArgs('pull', ['--no-rebase', '--exec=unsafe'])).toThrow();
  });
  it('allows known command names', () => {
    expect(() => assertAllowedGitCommand('status')).not.toThrow();
    expect(() => assertAllowedGitCommand('forensicHistory')).not.toThrow();
  });

  it('rejects unknown command names', () => {
    expect(() => assertAllowedGitCommand('rev-parse')).toThrow('Git command not allowed.');
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

  it('allows only the revert shapes built by the UI', () => {
    const hash = 'a'.repeat(40);
    expect(() => validateCommandArgs('revert', ['--no-edit', hash])).not.toThrow();
    expect(() => validateCommandArgs('revert', ['-m', '1', '--no-edit', hash])).not.toThrow();
    expect(() => validateCommandArgs('revert', [hash])).not.toThrow();
    // A leading option used to pass because args[indexOf('-m') + 1] was args[0].
    expect(() => validateCommandArgs('revert', ['--strategy=ours', hash])).toThrow('Unsupported argument for git revert.');
    expect(() => validateCommandArgs('revert', ['--edit', hash])).toThrow('Unsupported argument for git revert.');
    expect(() => validateCommandArgs('revert', ['HEAD~5..HEAD', hash])).toThrow('Unsupported argument for git revert.');
    expect(() => validateCommandArgs('revert', ['-m', 'x', hash])).toThrow('Invalid revert mainline.');
    expect(() => validateCommandArgs('revert', ['--no-edit', 'HEAD'])).toThrow('Invalid commit hash.');
  });

  it('allows the tag-free background fetch used for remote status checks', () => {
    expect(() => validateCommandArgs('fetch', ['origin', '--prune', '--no-tags', '--quiet'])).not.toThrow();
    expect(() => validateCommandArgs('fetch', ['origin', '--prune', '--no-tags', '--quiet', '+refs/tags/*:refs/ogc/remote-tags/origin/*'])).not.toThrow();
    expect(() => validateCommandArgs('fetch', ['origin', '--no-tags', '--quiet', '+refs/tags/v2.0.3:refs/tags/v2.0.3'])).not.toThrow();
  });

  it('allows only the bounded tag-reference query used for conflict indicators', () => {
    expect(() =>
      validateCommandArgs('forEachRef', ['--format=%(refname)%00%(objectname)%00%(*objectname)', 'refs/tags', 'refs/ogc/remote-tags/origin/']),
    ).not.toThrow();
    expect(() => validateCommandArgs('forEachRef', ['--format=%(refname)', 'refs/tags', 'refs/ogc/remote-tags/origin/'])).toThrow(
      'Unsupported argument combination for git for-each-ref.',
    );
  });

  it('allows the atomic adoption of a missing remote tag', () => {
    expect(() => validateCommandArgs('adoptRemoteTag', ['origin', 'v2.0.3'])).not.toThrow();
    expect(() => validateCommandArgs('adoptRemoteTag', ['origin/unsafe', 'v2.0.3'])).toThrow('Invalid remote tag adoption request.');
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
    expect(normalizeCommandArgs('rm', ['--cached', '-f', '--', 'first commit.txt'])).toEqual(['--cached', '-f', '--', ':(literal)first commit.txt']);
  });

  it('allows only forced index-only git rm operations', () => {
    expect(() => validateCommandArgs('rm', ['--cached', '-f', '--', 'file.txt'])).not.toThrow();
    expect(() => validateCommandArgs('rm', ['-f', '--', 'file.txt'])).toThrow('Only forced cached removal');
    expect(() => validateCommandArgs('rm', ['--cached', '-f', '--ignore-unmatch', '--', 'file.txt'])).toThrow();
  });

  it('allows the NUL-delimited stash file listing used by the stash panel', () => {
    expect(() => validateCommandArgs('stash', ['show', '-u', '--name-only', '-z', 'stash@{0}'])).not.toThrow();
    expect(() => validateCommandArgs('stash', ['show', '-u', '--name-only', '--format=unsafe', 'stash@{0}'])).toThrow(
      'Unsupported argument combination for git stash.',
    );
  });

  it('allows NUL-delimited rename-aware file diffs', () => {
    expect(() => validateCommandArgs('diff', ['--name-status', '-M', '-z', 'a'.repeat(40), 'b'.repeat(40)])).not.toThrow();
  });

  it('allows only the scoped PR upstream configuration required by review branches', () => {
    expect(() => validateCommandArgs('branch', ['--list', 'pr-42-feature'])).not.toThrow();
    expect(() => validateCommandArgs('config', ['--local', 'branch.pr-42-feature.remote', 'origin'])).not.toThrow();
    expect(() => validateCommandArgs('config', ['--local', 'branch.pr-42-feature.merge', 'refs/pull/42/head'])).not.toThrow();
    expect(() => validateCommandArgs('config', ['--local', 'core.hooksPath', 'unsafe'])).toThrow('Unsupported Git config key.');
  });

  it('validates forensic line range queries', () => {
    expect(() => validateCommandArgs('forensicHistory', ['line', 'src/App.tsx', '', '10', '20', '100'])).not.toThrow();
    expect(() => validateCommandArgs('forensicHistory', ['line', 'src/App.tsx', '', '20', '10', '100'])).toThrow('Invalid forensic end line.');
  });
});
