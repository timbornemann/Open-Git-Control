import { useEffect, useState } from 'react';
import type { CommitMessageEditResult } from '@/shared/ipc/commitMessageEdit';
import { CommitMessageEditDialog } from './CommitMessageEditDialog';

export function useCommitMessageEditor(repoPath: string | null, selectedHash: string | null, navigate: (hash: string) => void, refresh: () => void) {
  const [target, setTarget] = useState<{ repoPath: string; hash: string } | null>(null);
  useEffect(() => {
    setTarget(null);
  }, [repoPath]);
  const close = () => setTarget(null);
  const saved = (result: CommitMessageEditResult) => {
    if (result.changed && target) {
      navigate(result.hashMapping[selectedHash || ''] || result.hashMapping[target.hash]);
      refresh();
    }
    close();
  };
  return {
    open: (hash: string) => {
      if (repoPath) setTarget({ repoPath, hash });
    },
    dialog:
      target && target.repoPath === repoPath ? (
        <CommitMessageEditDialog
          key={`${target.repoPath}\0${target.hash}`}
          repoPath={target.repoPath}
          commitHash={target.hash}
          onClose={close}
          onSaved={saved}
        />
      ) : null,
  };
}
