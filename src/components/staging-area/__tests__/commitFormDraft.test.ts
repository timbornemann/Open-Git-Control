import { beforeEach, describe, expect, it } from 'vitest';
import { clearCommitFormDraftsForTests, getCommitFormDraft, resetCommitFormDraft, updateCommitFormDraft } from '@/components/staging-area/commitFormDraft';

describe('commitFormDraft', () => {
  beforeEach(() => {
    clearCommitFormDraftsForTests();
  });

  it('keeps commit title and description for the same repository key', () => {
    updateCommitFormDraft('C:\\Repos\\Open-Git-Control', {
      commitMsg: 'fix(staging): keep draft message',
      commitDescription: 'Preserve notes while inspecting files.',
    });

    expect(getCommitFormDraft('c:/repos/open-git-control/', '')).toEqual({
      commitMsg: 'fix(staging): keep draft message',
      commitDescription: 'Preserve notes while inspecting files.',
    });
  });

  it('keeps drafts isolated per repository', () => {
    updateCommitFormDraft('C:/Repos/one', { commitMsg: 'first repo' });
    updateCommitFormDraft('C:/Repos/two', { commitMsg: 'second repo' });

    expect(getCommitFormDraft('C:/Repos/one', '').commitMsg).toBe('first repo');
    expect(getCommitFormDraft('C:/Repos/two', '').commitMsg).toBe('second repo');
  });

  it('resets a committed draft back to the current template', () => {
    updateCommitFormDraft('C:/Repos/one', {
      commitMsg: 'temporary title',
      commitDescription: 'temporary notes',
    });

    expect(resetCommitFormDraft('C:/Repos/one', 'docs: template')).toEqual({
      commitMsg: 'docs: template',
      commitDescription: '',
    });
  });
});
