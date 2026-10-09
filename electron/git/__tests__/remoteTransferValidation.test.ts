import { describe, expect, it } from 'vitest';
import { normalizeRemotePreferences } from '../remoteTransferValidation';

describe('remote selection preference validation', () => {
  const selection = {
    remotes: [
      {
        name: 'origin',
        urls: ['https://host.test/team/repo.git'],
        bindings: [
          {
            remoteName: 'origin',
            url: 'https://host.test/team/repo.git',
            repository: { connectionId: 'account', repositoryId: '1', fullPath: 'team/repo' },
            credentialMode: 'hosting',
          },
        ],
      },
    ],
  };

  it('normalizes independent modes, sources, branch mappings and snapshots', () => {
    const input = {
      fetchRemote: 'origin',
      pullRemote: 'backup',
      pullStrategy: 'rebase',
      selectionModes: { fetch: 'remember', pull: 'ask', push: 'remember' },
      selectionSnapshots: { fetch: selection, push: selection },
      pullBranches: { 'feature/demo': 'private/demo' },
      pushBranches: { 'feature/demo': { origin: 'public/demo', backup: 'private/demo' } },
    };
    expect(normalizeRemotePreferences(input)).toEqual(input);
  });

  it.each([
    { selectionModes: { fetch: 'auto' } },
    { selectionModes: { remove: 'ask' } },
    { pullRemote: '-unsafe' },
    { pullStrategy: 'no-ff' },
    { pullStrategy: '--rebase' },
    { pullStrategy: null },
    { pullStrategy: false },
    { pullBranches: { main: 'bad branch' } },
    { pushBranches: { main: { '-unsafe': 'main' } } },
    { pushBranches: { main: { origin: '--delete' } } },
    { selectionSnapshots: { fetch: { remotes: [] } } },
    { selectionSnapshots: { fetch: { remotes: [...selection.remotes, { ...selection.remotes[0], name: 'backup' }] } } },
    { selectionSnapshots: { push: { remotes: [...selection.remotes, ...selection.remotes] } } },
    { selectionSnapshots: { fetch: { remotes: [{ ...selection.remotes[0], urls: ['https://secret@host.test/team/repo.git'] }] } } },
    { selectionSnapshots: { fetch: { remotes: [{ ...selection.remotes[0], bindings: [{ ...selection.remotes[0].bindings[0], remoteName: 'backup' }] }] } } },
    {
      selectionSnapshots: {
        fetch: { remotes: [{ ...selection.remotes[0], bindings: [{ ...selection.remotes[0].bindings[0], url: 'https://other.test/team/repo.git' }] }] },
      },
    },
  ])('rejects invalid action preferences %#', (input) => {
    expect(() => normalizeRemotePreferences(input)).toThrow();
  });
});
