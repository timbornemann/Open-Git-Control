import { Fragment, useMemo, type ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { findRepositoryRunFileReferences, type RepositoryRunFileTarget } from '@/utils/repositoryRunFileLinks';

export type RepositoryRunFileLinkProps = { repoPath: string; onOpenFile?: (target: RepositoryRunFileTarget) => void };

export function RepositoryRunFileLink({
  target,
  children,
  onOpenFile,
}: {
  target: RepositoryRunFileTarget;
  children: ReactNode;
  onOpenFile?: RepositoryRunFileLinkProps['onOpenFile'];
}) {
  const { tr } = useI18n();
  if (!onOpenFile) return <>{children}</>;
  const location = target.path + (target.line ? ':' + target.line + (target.column ? ':' + target.column : '') : '');
  const label = tr('Im App-Editor öffnen: ' + location, 'Open in app editor: ' + location);
  return (
    <button type="button" className="repository-run-console__file-link" title={label} aria-label={label} onClick={() => onOpenFile(target)}>
      {children}
    </button>
  );
}

export function RepositoryRunLinkedText({ text, repoPath, onOpenFile }: { text: string } & RepositoryRunFileLinkProps) {
  const canOpenFile = Boolean(onOpenFile);
  const references = useMemo(() => (canOpenFile ? findRepositoryRunFileReferences(text, repoPath) : []), [text, repoPath, canOpenFile]);
  if (!references.length) return <>{text}</>;
  let end = 0;
  const parts = references.map((reference) => {
    const before = text.slice(end, reference.start);
    end = reference.end;
    return (
      <Fragment key={reference.start}>
        {before}
        <RepositoryRunFileLink target={reference.target} onOpenFile={onOpenFile}>
          {reference.text}
        </RepositoryRunFileLink>
      </Fragment>
    );
  });
  return (
    <>
      {parts}
      {text.slice(end)}
    </>
  );
}
