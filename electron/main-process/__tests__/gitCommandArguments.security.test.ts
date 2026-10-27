import { describe, expect, it } from 'vitest';
import { normalizeCommandArgs, validateCommandArgs } from '../gitCommandPolicy';
import { GIT_COMMAND_NAMES } from '../../../src/shared/ipc/gitCommands';

describe('Git operand boundaries', () => {
  it.each(GIT_COMMAND_NAMES.filter((command) => !command.startsWith('conflict')))('keeps unapproved process options blocked for %s', (command) => {
    expect(() => normalizeCommandArgs(command, ['--upload-pack=unapproved-program'])).toThrow();
    expect(() => normalizeCommandArgs(command, ['--output=/outside/file'])).toThrow();
    expect(() => normalizeCommandArgs(command, ['-c', 'core.sshCommand=unapproved-program'])).toThrow();
  });
  it.each(['conflictTakeOurs', 'conflictTakeTheirs', 'conflictTakeDeleted', 'conflictMarkResolved'] as const)(
    'keeps option-like filenames usable for %s',
    (command) => {
      expect(normalizeCommandArgs(command, ['--upload-pack=filename'])).toEqual(['--upload-pack=filename']);
    },
  );
  it.each(['checkout', 'show'] as const)('terminates %s revision operands without changing explicit file operations', (command) => {
    for (const revision of ['main', 'feature/topic', 'origin/main', 'HEAD~1', 'stash@{0}^3', 'a'.repeat(64)]) {
      expect(normalizeCommandArgs(command, [revision])).toEqual([revision, '--']);
    }
    expect(normalizeCommandArgs(command, ['HEAD', '--', 'docs/[draft].txt'])).toEqual(['HEAD', '--', ':(literal)docs/[draft].txt']);
  });

  it.each(['checkout', 'show'] as const)('rejects filesystem paths where %s expects a revision', (command) => {
    for (const file of ['/outside/private', 'C:/outside/private', 'C:\\outside\\private', '\\\\server\\share', '../private', '..\\private']) {
      expect(() => normalizeCommandArgs(command, [file])).toThrow('revision');
      expect(() => normalizeCommandArgs(command, [file, '--', 'tracked.txt'])).toThrow('revision');
    }
  });

  it('preserves branch creation, resets and tracking checkouts', () => {
    for (const args of [
      ['-b', 'new'],
      ['-B', 'new', 'HEAD~1'],
      ['--track', 'origin/topic'],
      ['-b', 'new', '--track', 'origin/topic'],
    ]) {
      expect(normalizeCommandArgs('checkout', args)).toEqual([...args, '--']);
    }
    expect(() => normalizeCommandArgs('checkout', ['-b', 'new', '../private'])).toThrow('Checkout revision');
    expect(() => normalizeCommandArgs('checkout', ['--track', 'C:/private'])).toThrow('Checkout revision');
  });

  it.each(['ext::command', '1helper::command', '::command', 'custom://host/repository', '1helper://host/repository', 'UNSUPPORTED://host/repository'])(
    'rejects external helper transport %s',
    (url) => {
      for (const command of ['fetch', 'push'] as const) expect(() => validateCommandArgs(command, [url])).toThrow();
      for (const action of ['add', 'set-url']) expect(() => validateCommandArgs('remote', [action, 'origin', url])).toThrow();
      expect(() => validateCommandArgs('config', ['--local', 'branch.pr-1-topic.remote', url])).toThrow();
    },
  );

  it.each([
    'origin',
    '.',
    '../server.git',
    '/srv/git/server.git',
    'C:\\repos\\server.git',
    '\\\\server\\share\\repo.git',
    'git@example.test:group/repo.git',
    'https://example.test/group/repo.git',
    'ssh://git@example.test/group/repo.git',
    'file:///srv/repo.git',
    'git+ssh://example.test/repo.git',
    'ssh+git://example.test/repo.git',
  ])('keeps standard and local remote addresses: %s', (url) => {
    expect(() => validateCommandArgs('fetch', [url])).not.toThrow();
    expect(() => validateCommandArgs('push', ['-u', url, 'HEAD'])).not.toThrow();
    expect(() => validateCommandArgs('remote', ['add', 'origin', url])).not.toThrow();
  });

  it('allows metadata and literal formats without starting configured signature programs', () => {
    for (const format of ['', '%B', '%H', '%P', 'raw', 'format:literal', '%h %s', '%%G?', 'tformat:%H%x00%B']) {
      expect(() => validateCommandArgs('show', ['-s', `--format=${format}`, 'HEAD'])).not.toThrow();
    }
    for (const format of ['configured-alias', '%G?', '%+GS', '%-GG', '% GF', 'format:%G?', 'tformat:%C(auto)%GK']) {
      expect(() => validateCommandArgs('show', ['-s', `--format=${format}`, 'HEAD'])).toThrow('Unsupported argument for git show');
    }
  });
});
