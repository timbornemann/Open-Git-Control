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
      subject: { type: 'fix', scope: 'staging', message: 'keep draft message' },
    });
  });

  it('keeps drafts isolated per repository', () => {
    updateCommitFormDraft('C:/Repos/one', { commitMsg: 'first repo' });
    updateCommitFormDraft('C:/Repos/two', { commitMsg: 'second repo' });

    expect(getCommitFormDraft('C:/Repos/one', '').commitMsg).toBe('first repo');
    expect(getCommitFormDraft('C:/Repos/two', '').commitMsg).toBe('second repo');
  });

  it('clears every field after a commit even when a template is configured', () => {
    updateCommitFormDraft('C:/Repos/one', {
      commitMsg: 'temporary title',
      commitDescription: 'temporary notes',
    });

    expect(resetCommitFormDraft('C:/Repos/one')).toEqual({
      commitMsg: '',
      commitDescription: '',
      subject: { type: '', scope: '', message: '' },
    });
    expect(getCommitFormDraft('C:/Repos/one', 'docs: template').commitMsg).toBe('');
  });

  it('keeps an unfinished type and scope without making a committable title', () => {
    updateCommitFormDraft('C:/Repos/one', { subject: { type: 'fix', scope: 'backend', message: '' } });
    expect(getCommitFormDraft('C:/Repos/one', '')).toMatchObject({
      commitMsg: '',
      subject: { type: 'fix', scope: 'backend', message: '' },
    });
  });

  it('requires a message for imported and template types too', () => {
    expect(getCommitFormDraft('C:/Repos/one', 'fix(backend): ').commitMsg).toBe('');
    expect(updateCommitFormDraft('C:/Repos/one', { commitMsg: 'docs: ' }).commitMsg).toBe('');
  });
});
