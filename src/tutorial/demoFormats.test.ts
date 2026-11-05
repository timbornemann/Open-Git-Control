import { describe, expect, it } from 'vitest';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import type { TutorialLaunchContext } from '@/shared/tutorial/types';
import { parseCsvDocument, serializeCsvDocument } from '@/components/working-directory/csvDocument';
import { createDemoApi } from './demoApi';
import { formatText, demoFormatFiles } from './demoFormatExamples';
import { DEMO_REPO } from './demoRepository';

function create(language: 'de' | 'en', chapterId = 'formats-csv', stepId = 'overview') {
  const context: TutorialLaunchContext = {
    request: { chapterId, stepId },
    language,
    theme: 'copper-night',
    progress: { version: 1, welcomeSeen: true, completedChapters: [] },
  };
  const step = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === chapterId)!.steps.find((entry) => entry.id === stepId)!;
  return createDemoApi(context, step);
}

describe.each(['de', 'en'] as const)('private file-format examples in %s', (language) => {
  it('starts with a clean, tracked example and localized, source-consistent files', async () => {
    const { api, repo } = create(language);
    expect(repo.status()).toBe('');
    for (const [path, content] of Object.entries(demoFormatFiles(language))) {
      expect(repo.files[path]).toBe(content);
      expect(repo.indexFiles[path]).toBe(content);
      expect(repo.headFiles[path]).toBe(content);
      expect(repo.commits[0].files?.[path]).toBe(content);
    }
    expect(await api.git.listWorkingDirectory(DEMO_REPO, 'site')).toMatchObject({
      success: true,
      data: expect.arrayContaining([{ path: 'site/style.css', name: 'style.css', kind: 'file', bytes: expect.any(Number) }]),
    });
  });

  it.each([
    ['docs/guide.md', 'markdown-edited'],
    ['site/index.html', 'html-edited'],
    ['data/tasks.csv', 'csv-quoted'],
  ] as const)('saves %s while retaining the original index and committed source', async (path, version) => {
    const { api, repo } = create(language);
    const request = { repoPath: DEMO_REPO, path, source: 'unstaged' as const };
    const original = repo.files[path];
    const preview = await api.git.getRepositoryFilePreview(request);
    expect(preview.success).toBe(true);
    const content = formatText(version, language);
    const saved = await api.git.saveRepositoryFile({ ...request, content, encoding: 'utf8', expectedVersion: preview.success ? preview.data.version : '' });
    expect(saved.success).toBe(true);
    expect(repo.files[path]).toBe(content);
    expect(repo.indexFiles[path]).toBe(original);
    expect(repo.commits[0].files?.[path]).toBe(original);
    expect([...repo.modified]).toEqual([path]);
    expect(repo.staged.size).toBe(0);
    expect(repo.diff(path, false)).toContain(path);
  });

  it('preserves quoted CSV values through row and column operations', () => {
    const document = parseCsvDocument(formatText('csv-quoted', language));
    expect(document.rows[1][1]).toBe(language === 'de' ? 'Bereit; geprüft' : 'Ready; reviewed');
    expect(document.delimiter).toBe(';');
    document.rows.push(['', '']);
    expect(serializeCsvDocument(document)).toBe(formatText('csv-row', language));
    document.rows.forEach((row) => row.push(''));
    expect(serializeCsvDocument(document)).toBe(formatText('csv-column', language));
    document.rows = document.rows.map((row) => row.slice(0, -1)).filter((_, index) => index < 2);
    expect(serializeCsvDocument(document)).toBe(formatText('csv-removed', language));
  });

  it('restores final save checkpoints with a fresh index instead of the previous saved draft', () => {
    const { repo } = create(language, 'formats-csv', 'save-final');
    expect(repo.files['data/tasks.csv']).toBe(formatText('csv-quoted', language));
    expect(repo.indexFiles['data/tasks.csv']).toBe(formatText('csv', language));
    expect(repo.staged.size).toBe(0);
    expect(create(language).repo.status()).toBe('');
  });

  it('reads local HTML assets from the requested version without any IO', async () => {
    const { api, repo } = create(language, 'formats-html');
    const path = 'site/style.css';
    repo.files[path] = 'body { background: red; }';
    expect(await api.git.getMarkdownPreviewFile({ repoPath: DEMO_REPO, path, source: 'unstaged' })).toMatchObject({
      success: true,
      data: { text: repo.files[path] },
    });
    expect(await api.git.getMarkdownPreviewFile({ repoPath: DEMO_REPO, path, source: 'staged' })).toMatchObject({
      success: true,
      data: { text: formatText('stylesheet', language) },
    });
    expect((await api.git.getMarkdownPreviewFile({ repoPath: 'C:/personal', path, source: 'unstaged' })).success).toBe(false);
  });
});
