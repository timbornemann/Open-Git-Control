import { describe, expect, it, vi } from 'vitest';
import { RepositoryFiles } from '../RepositoryFiles';

describe('RepositoryFiles text preview encoding', () => {
  it('decodes UTF-16 staged and committed Markdown instead of forcing UTF-8', async () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('# Überschrift', 'utf16le')]);
    const readGitFileBuffer = vi.fn().mockResolvedValue(utf16);
    const files = new RepositoryFiles(() => 'C:/repo', readGitFileBuffer);

    await expect(files.readRepositoryFileTextAtSource('staged', 'README.md')).resolves.toBe('# Überschrift');
    await expect(files.readRepositoryFileTextAtSource('commit', 'README.md', 'a'.repeat(40))).resolves.toBe('# Überschrift');
  });
});
