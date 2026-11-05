import { expect, it } from 'vitest';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { createDemoApi } from './demoApi';
import { DEMO_REPO } from './demoRepository';
import { resolveDemoCommit } from './demoHistory';
import { practiceCommitHash } from '@/shared/tutorial/exampleGitIds';
import { historyText } from './demoHistoryExamples';
import { resolveTutorialFileContent } from './demoContent';
import { demoBlobText } from './demoBlob';

it.each(['de', 'en'] as const)('restores branch lesson references and actual working files independently in %s', async (language) => {
  for (const chapter of TUTORIAL_CHAPTERS.filter((chapter) => chapter.id === 'branches' || chapter.id.startsWith('branches-')))
    for (const step of chapter.steps) {
      const { api, repo } = createDemoApi(
        {
          request: { chapterId: chapter.id, stepId: step.id },
          language,
          theme: 'copper-night',
          progress: { version: 1, welcomeSeen: true, completedChapters: [] },
        },
        step,
      );
      const setup = step.prepare!.branches!;
      expect(repo.branch, chapter.id + '/' + step.id).toBe(setup.current);
      for (const head of setup.heads) expect(resolveDemoCommit(repo, head.name)?.hash).toBe(practiceCommitHash(head.commit));
      for (const head of setup.remotes || []) expect(resolveDemoCommit(repo, head.name)?.hash).toBe(practiceCommitHash(head.commit));
      if (!step.prepare?.edits?.length && !step.prepare?.indexEdits?.length) expect(repo.status()).toBe('');
      for (const edit of step.prepare?.edits || []) expect(demoBlobText(repo.files[edit.path])).toBe(resolveTutorialFileContent(edit.content, language));
      for (const edit of step.prepare?.indexEdits || [])
        expect(demoBlobText(repo.indexFiles[edit.path])).toBe(resolveTutorialFileContent(edit.content, language));
      const result = await api.git.readRepoFile('README.md', DEMO_REPO);
      const current = setup.heads.find((head) => head.name === setup.current)!.commit;
      const version = ({ 1: 'initial', 2: 'app', 3: 'description', 4: 'latest' } as const)[current as 1 | 2 | 3 | 4];
      const edit = step.prepare?.edits?.find((entry) => entry.path === 'README.md');
      expect(result).toEqual({ success: true, data: edit ? resolveTutorialFileContent(edit.content, language) : historyText(version, language) });
      expect(repo.events.size).toBe(0);
    }
});
