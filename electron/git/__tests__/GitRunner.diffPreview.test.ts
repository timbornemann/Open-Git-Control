import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { GitRunner } from '../GitRunner';
import { normalizeDiffPreviewArgs } from '../../main-process/diffPreviewPolicy';

const repositories: string[] = [];
const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });

const fixture = () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-untracked-diff-'));
  repositories.push(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'core.autocrlf', 'false');
  const runner = new GitRunner();
  const preview = (filePath: string, staged = false, limits?: { maxBytes?: number; maxLines?: number }) =>
    runner.getDiffPreview(repo, normalizeDiffPreviewArgs(['diff', ...(staged ? ['--cached'] : []), '--', filePath]), limits);
  const write = (filePath: string, contents: string | Buffer) => {
    const target = path.join(repo, filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  return { repo, runner, preview, write };
};

afterEach(() => {
  for (const repo of repositories.splice(0)) {
    if (path.dirname(path.resolve(repo)) !== path.resolve(os.tmpdir()) || !path.basename(repo).startsWith('ogc-untracked-diff-')) {
      throw new Error('Unexpected test repository cleanup path.');
    }
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

describe('GitRunner working-tree diff previews', () => {
  it('shows untracked contents as additions on an unborn branch without changing the index or file', async () => {
    const { repo, preview, write } = fixture();
    write('new.txt', 'first line\nlast line');
    const status = git(repo, 'status', '--porcelain=v1', '-z');

    const result = await preview('new.txt');

    expect(result.text).toContain('new file mode');
    expect(result.text).toContain('--- /dev/null');
    expect(result.text).toContain('+++ b/new.txt');
    expect(result.text).toContain('+first line\n+last line');
    expect(result.text).toContain('\\ No newline at end of file');
    expect(result.truncated).toBe(false);
    expect(git(repo, 'status', '--porcelain=v1', '-z')).toBe(status);
    expect(git(repo, 'ls-files', '--cached')).toBe('');
    expect(fs.existsSync(path.join(repo, '.git', 'index'))).toBe(false);
    expect(fs.readFileSync(path.join(repo, 'new.txt'), 'utf8')).toBe('first line\nlast line');
  });

  it.each(['folder/new [file].txt', '-new.txt', 'ä-new.txt'])('previews only the literal selected file %s', async (filePath) => {
    const { preview, write } = fixture();
    write(filePath, 'selected content\n');
    write('folder/new f.txt', 'other content\n');

    const result = await preview(filePath);

    expect(result.text).toContain('+selected content');
    expect(result.text).not.toContain('other content');
  });

  it('keeps staged, modified, and deleted tracked previews unchanged', async () => {
    const { repo, preview, write } = fixture();
    write('tracked.txt', 'staged content\n');
    git(repo, 'add', '--', 'tracked.txt');
    const index = fs.readFileSync(path.join(repo, '.git', 'index'));
    expect((await preview('tracked.txt', true)).text).toContain('+staged content');
    expect((await preview('tracked.txt')).text).toBe('');

    write('tracked.txt', 'modified content\n');
    expect((await preview('tracked.txt')).text).toContain('-staged content\n+modified content');
    fs.unlinkSync(path.join(repo, 'tracked.txt'));
    expect((await preview('tracked.txt')).text).toContain('deleted file mode');
    expect(fs.readFileSync(path.join(repo, '.git', 'index'))).toEqual(index);
  });

  it('does not include ignored files in untracked previews', async () => {
    const { preview, write } = fixture();
    write('.gitignore', 'ignored.txt\n');
    write('ignored.txt', 'ignored content\n');

    expect((await preview('ignored.txt')).text).toBe('');
  });

  it('preserves binary and empty-file metadata', async () => {
    const { preview, write } = fixture();
    write('binary.bin', Buffer.from([0, 1, 2, 255]));
    write('empty.txt', '');

    expect((await preview('binary.bin')).text).toContain('Binary files');
    const empty = await preview('empty.txt');
    expect(empty.text).toContain('new file mode');
    expect(empty.text).not.toContain('@@');
  });

  it('keeps preview limits when a new file has many lines', async () => {
    const { preview, write } = fixture();
    write('large.txt', `${Array.from({ length: 300 }, (_, index) => `line ${index}`).join('\n')}\n`);

    const result = await preview('large.txt', false, { maxLines: 100 });

    expect(result.truncated).toBe(true);
    expect(result.lines).toBeLessThanOrEqual(100);
    expect(result.text).toContain('+line 0');
    expect(result.text).not.toContain('+line 299');
  });

  it('produces a new-file patch that can be applied to the index', async () => {
    const { repo, runner, preview, write } = fixture();
    write('new.txt', 'first\nsecond\n');
    const patch = (await preview('new.txt')).text;

    await runner.runWithInput(repo, ['apply', '--cached'], patch);

    expect(git(repo, 'show', ':new.txt')).toBe('first\nsecond\n');
    expect((await preview('new.txt')).text).toBe('');
    expect((await preview('new.txt', true)).text).toContain('+first\n+second');
  });
});
