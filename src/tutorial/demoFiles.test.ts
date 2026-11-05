import { describe, expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import type { TutorialLaunchContext, TutorialStep } from '@/shared/tutorial/types';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
const context: TutorialLaunchContext = {
  request: { chapterId: 'staging-scope' },
  language: 'de',
  theme: 'copper-night',
  progress: { version: 1, welcomeSeen: true, completedChapters: [] },
};
const create = () =>
  createDemoApi(context, { id: 'files', title: ['', ''], description: ['', ''], target: 'body', area: 'repo', scenario: 'scope' } satisfies TutorialStep);
describe('versioned practice files', () => {
  it('keeps worktree, index and HEAD separate and discards only the unstaged version', async () => {
    const { api, repo } = create();
    const originalHead = repo.headFiles['README.md'];
    const selected = repo.files['README.md'];
    await api.git.stagePaths(['README.md']);
    await api.git.writeRepoFile('README.md', selected + 'A later edit\n');
    expect(repo.status()).toContain('MM README.md');
    expect(repo.diff('README.md')).toContain('+A later edit');
    expect(repo.diff('README.md', true)).toContain('+Willkommen');
    expect(repo.headFiles['README.md']).toBe(originalHead);
    await api.git.runGitCommand('checkout', '--', 'README.md');
    expect(repo.files['README.md']).toBe(selected);
    expect(repo.indexFiles['README.md']).toBe(selected);
    expect(repo.staged.has('README.md')).toBe(true);
    expect(repo.modified.has('README.md')).toBe(false);
    expect(repo.branch).toBe('main');
    expect(repo.branches).not.toContain('README.md');
  });
  it('restores a literal selection and leaves other staged, modified and new files intact', async () => {
    const { api, repo } = create();
    const packageText = repo.files['package.json'];
    const application = repo.indexFiles['src/app.ts'];
    await api.git.runGitCommand('checkout', '--', 'README.md');
    expect(repo.modified.has('README.md')).toBe(false);
    expect(repo.modified.has('package.json')).toBe(true);
    expect(repo.files['package.json']).toBe(packageText);
    expect(repo.indexFiles['src/app.ts']).toBe(application);
    expect([...repo.untracked].sort()).toEqual(['docs/ideas.md', 'notes.txt']);
    expect((await api.git.runGitCommand('checkout', '--', 'notes.txt')).success).toBe(false);
    expect(repo.files['notes.txt']).toBeDefined();
  });
  it('discards tracked changes repository-wide without dropping the index or untracked files', async () => {
    const { api, repo } = create();
    await api.git.runGitCommand('checkout', '--', '.');
    expect(repo.modified.size).toBe(0);
    expect([...repo.staged]).toEqual(['src/app.ts']);
    expect([...repo.untracked].sort()).toEqual(['docs/ideas.md', 'notes.txt']);
  });
  it('deletes only explicitly selected untracked files', async () => {
    const { api, repo } = create();
    expect((await api.git.runGitCommand('clean', '-fd')).success).toBe(false);
    expect((await api.git.runGitCommand('clean', '-f', '--', 'README.md')).success).toBe(false);
    expect((await api.git.runGitCommand('clean', '-f', '--', 'notes.txt')).success).toBe(true);
    expect(repo.files['notes.txt']).toBeUndefined();
    expect(repo.untracked.has('notes.txt')).toBe(false);
    expect(repo.files['docs/ideas.md']).toBeDefined();
  });
  it('commits the selected version while retaining later working edits', async () => {
    const { api, repo } = create();
    const selected = repo.files['README.md'];
    await api.git.stagePaths(['README.md']);
    await api.git.writeRepoFile('README.md', selected + 'After staging\n');
    await api.git.createCommit({ title: 'docs: selected version' });
    expect(repo.headFiles['README.md']).toBe(selected);
    expect(repo.commits[0].files?.['README.md']).toBe(selected);
    expect(repo.files['README.md']).toContain('After staging');
    expect(repo.staged.size).toBe(0);
    expect(repo.modified.has('README.md')).toBe(true);
  });
  it('retains separate versions when changing projects and rejects writes to a previous selection', async () => {
    const { api, repo } = create();
    await api.git.stagePaths(['README.md']);
    const index = repo.indexFiles['README.md'];
    await api.git.setRepoPath(DEMO_SECOND_REPO);
    expect(repo.indexFiles['README.md']).toContain('Notizbuch');
    expect((await api.git.runGitCommandForRepo(DEMO_REPO, 'checkout', '--', 'README.md')).success).toBe(false);
    await api.git.setRepoPath(DEMO_REPO);
    expect(repo.indexFiles['README.md']).toBe(index);
    expect(repo.staged.has('README.md')).toBe(true);
  });
  it('renders the requested source and path in previews and diffs', async () => {
    const { api, repo } = create();
    const before = repo.headFiles['README.md'];
    await api.git.stagePaths(['README.md']);
    await api.git.writeRepoFile('README.md', 'Edited working copy\n');
    const preview = (source: 'staged' | 'unstaged' | 'commit') =>
      api.git.getRepositoryFilePreview({ repoPath: DEMO_REPO, path: 'README.md', source, commitHash: repo.commits[0].hash });
    expect(await preview('staged')).toMatchObject({ data: { text: repo.indexFiles['README.md'] } });
    expect(await preview('unstaged')).toMatchObject({ data: { text: 'Edited working copy\n' } });
    expect(await preview('commit')).toMatchObject({ data: { text: before } });
    expect(await api.git.getDiffPreview(['--', 'package.json'])).toMatchObject({ data: { text: expect.stringContaining('+  "description"') } });
    expect(await api.git.getDiffPreview(['--cached', '--', 'README.md'])).toMatchObject({ data: { text: expect.stringContaining('+Willkommen') } });
  });
});
describe('practice ignore rules', () => {
  it('writes a rule once, hides matching untracked files and preserves their contents', async () => {
    const { api, repo } = create();
    const text = repo.files['notes.txt'];
    expect(await api.git.addIgnoreRule('notes.txt', DEMO_REPO)).toMatchObject({ success: true, added: true });
    expect(await api.git.addIgnoreRule('notes.txt', DEMO_REPO)).toMatchObject({ success: true, added: false });
    expect(repo.files['.gitignore']).toBe('notes.txt\n');
    expect(repo.files['notes.txt']).toBe(text);
    expect(repo.untracked.has('notes.txt')).toBe(false);
    expect(repo.untracked.has('.gitignore')).toBe(true);
    await api.git.stagePaths(['-A']);
    expect(repo.indexFiles['notes.txt']).toBeUndefined();
    expect(repo.indexFiles['.gitignore']).toBe('notes.txt\n');
  });
  it('does not stop tracking existing files and preserves staged new files until unstaged', async () => {
    const { api, repo } = create();
    await api.git.stagePaths(['notes.txt']);
    await api.git.addIgnoreRule('*.txt');
    expect(repo.staged.has('notes.txt')).toBe(true);
    await api.git.runGitCommand('reset', 'HEAD', '--', 'notes.txt');
    expect(repo.staged.has('notes.txt')).toBe(false);
    expect(repo.untracked.has('notes.txt')).toBe(false);
    await api.git.addIgnoreRule('README.md');
    expect(repo.modified.has('README.md')).toBe(true);
    expect(repo.files['README.md']).toBeDefined();
  });
  it('supports folder and file-type selections without ignoring tracked matches', async () => {
    const { api, repo } = create();
    await api.git.addIgnoreRule('docs/');
    expect(repo.untracked.has('docs/ideas.md')).toBe(false);
    await api.git.addIgnoreRule('*.md');
    expect(repo.modified.has('README.md')).toBe(true);
    expect((await api.git.addIgnoreRule('invalid\npattern')).success).toBe(false);
    expect((await api.git.addIgnoreRule('notes.txt', DEMO_SECOND_REPO)).success).toBe(false);
  });
  it('restores a folder rule into the index for a direct lesson entry', () => {
    const step = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'staging-ignore-folders')!.steps.find((entry) => entry.id === 'rule-staged')!;
    const { repo } = createDemoApi(context, step);
    expect([...repo.staged].sort()).toEqual(['.gitignore', 'src/app.ts']);
    expect(repo.indexFiles['.gitignore']).toBe('tmp/\n');
    expect(repo.files['tmp/build/output.log']).toBeDefined();
    expect(repo.files['tmp/cache/item.log']).toBeDefined();
    expect([...repo.untracked].sort()).toEqual(['docs/drafts/guide.md', 'docs/ideas.md', 'notes.txt']);
  });
  it('does not confuse a repeated rule with merely entering a preconfigured scene', async () => {
    const step = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'staging-ignore')!.steps.find((entry) => entry.id === 'repeat-rule')!;
    const { repo, api } = createDemoApi(context, step);
    expect(repo.files['.gitignore']).toBe('README.md\n');
    expect(repo.events.has('ignore-repeated')).toBe(false);
    expect(await api.git.addIgnoreRule('README.md')).toEqual({ success: true, added: false });
    expect(repo.events.has('ignore-repeated')).toBe(true);
    expect(repo.files['.gitignore']).toBe('README.md\n');
    expect(repo.modified.has('README.md')).toBe(true);
  });
});
