import { useEffect, useMemo, useState } from 'react';
import { DiffContentPane } from '@/components/diff-viewer/DiffContentPane';
import { parseDiff } from '@/utils/diffParser';
import { gitClient } from '@/services/gitClient';
import { repositoryFileClient } from '@/services/repositoryFileClient';
import { useI18n } from '@/i18n';
import type { BranchChangeFile, BranchChangeInspection } from '@/shared/ipc/branchChange';
import '@/styles/diff-viewer.css';

type Selection = { file: BranchChangeFile; group: 'staged' | 'unstaged' | 'new' };
function ChangePreview({ inspection, selection }: { inspection: BranchChangeInspection; selection: Selection }) {
  const { tr } = useI18n();
  const [data, setData] = useState({ text: '', loading: true, error: '', truncated: false, binary: selection.file.binary });
  const { file, group } = selection;
  useEffect(() => {
    let current = true;
    setData({ text: '', loading: true, error: '', truncated: false, binary: file.binary });
    void (async () => {
      if (group === 'new') {
        const untracked = inspection.stashParents?.untracked;
        const result = await repositoryFileClient.getRepositoryFilePreview({
          repoPath: inspection.repoPath,
          path: file.path,
          source: untracked ? 'commit' : 'unstaged',
          ...(untracked ? { commitHash: untracked } : {}),
        });
        if (!current) return;
        if (!result.success) throw new Error(result.error);
        const preview = result.data;
        const content = preview.kind === 'text' ? preview.text.slice(0, 256 * 1024) : '';
        const allLines = content.split('\n');
        const lines = allLines.slice(0, 3000);
        const text =
          preview.kind === 'text'
            ? `--- /dev/null\n+++ ${JSON.stringify('b/' + file.path)}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => '+' + line).join('\n')}`
            : '';
        setData({
          text,
          loading: false,
          error: preview.kind === 'missing' ? preview.reason : '',
          binary: preview.kind !== 'text',
          truncated:
            preview.kind === 'text'
              ? preview.text.length > content.length || allLines.length > lines.length
              : preview.kind === 'binary' && preview.reason === 'tooLarge',
        });
      } else {
        const parents = inspection.stashParents;
        const revisions = parents
          ? group === 'staged'
            ? [parents.base, parents.index]
            : [parents.index, inspection.session!.stashOid!]
          : group === 'staged'
            ? ['--cached']
            : [];
        const result = await gitClient.getDiffPreview(
          ['diff', ...revisions, '--no-ext-diff', '--no-textconv', '--', file.path],
          { maxBytes: 256 * 1024, maxLines: 3000 },
          inspection.repoPath,
        );
        if (!current) return;
        if (!result.success) throw new Error(result.error);
        setData({
          text: result.data.text,
          loading: false,
          error: '',
          truncated: result.data.truncated,
          binary: file.binary || /^(Binary files|GIT binary patch)/m.test(result.data.text),
        });
      }
    })().catch((error: unknown) => {
      if (current) setData((value) => ({ ...value, loading: false, error: String(error) }));
    });
    return () => {
      current = false;
    };
  }, [inspection, file, group]);
  const parsed = useMemo(() => parseDiff(data.text), [data.text]);
  return (
    <div className="branch-change-preview" aria-label={tr('Änderungsvorschau', 'Change preview')}>
      <DiffContentPane
        request={{ path: file.path, source: 'commit' }}
        viewMode="unified"
        diffText={data.text}
        parsed={parsed}
        isLoading={data.loading}
        error={data.error || null}
        canRenderText={!data.binary}
        isBinaryDiff={data.binary}
        looksBinaryByExt={false}
        isTooLarge={false}
        sourceTruncated={data.truncated}
        activeHunkIndex={0}
        setHunkRef={() => {}}
        scrollToHunk={() => {}}
        isHunkOperationRunning={false}
        applyHunk={() => {}}
        showBlame={false}
        isBlameLoading={false}
        blameMap={new Map()}
      />
    </div>
  );
}
export function BranchChangeFiles({ inspection }: { inspection: BranchChangeInspection }) {
  const { tr } = useI18n();
  const [selected, setSelected] = useState<Selection>();
  const groups = [
    { id: 'staged' as const, label: tr('Gestagt', 'Staged'), files: inspection.files.filter((file) => ![' ', '?'].includes(file.index)) },
    { id: 'unstaged' as const, label: tr('Ungestagt', 'Unstaged'), files: inspection.files.filter((file) => ![' ', '?'].includes(file.worktree)) },
    { id: 'new' as const, label: tr('Neue, nicht versionierte Dateien', 'New, untracked files'), files: inspection.files.filter((file) => file.index === '?') },
  ];
  return (
    <>
      <div className="branch-change-files">
        {groups.map((group) => (
          <section key={group.id}>
            <h4>
              {group.label} ({group.files.length})
            </h4>
            {group.files.length ? (
              <ul>
                {group.files.map((file) => (
                  <li key={file.path}>
                    <button
                      type="button"
                      onClick={() => setSelected({ file, group: group.id })}
                      aria-pressed={selected?.file === file && selected?.group === group.id}
                    >
                      <code>
                        {file.previousPath ? `${file.previousPath} → ` : ''}
                        {file.path}
                      </code>{' '}
                      <span>{file.binary ? tr('Binärdatei', 'Binary file') : group.id === 'staged' ? file.index : file.worktree}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="branch-change-muted">{tr('Keine', 'None')}</p>
            )}
          </section>
        ))}
      </div>
      {selected && <ChangePreview key={`${selected.group}:${selected.file.path}`} inspection={inspection} selection={selected} />}
    </>
  );
}
