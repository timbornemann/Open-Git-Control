import { useEffect, useRef, useState } from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { CommitMessageEditInspection, CommitMessageEditPhase, CommitMessageEditResult } from '@/shared/ipc/commitMessageEdit';
import { commitEditBlockText, commitEditErrorText, commitEditPhaseText } from './commitMessageEditText';

type Props = { repoPath: string; commitHash: string; onClose: () => void; onSaved: (result: CommitMessageEditResult) => void };

export function CommitMessageEditDialog({ repoPath, commitHash, onClose, onSaved }: Props) {
  const { tr } = useI18n();
  const [inspection, setInspection] = useState<CommitMessageEditInspection | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<CommitMessageEditPhase>('checking');
  const [cancelling, setCancelling] = useState(false);
  const operation = useRef<string | null>(null);
  const generation = useRef(0);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const current = ++generation.current;
    setInspection(null);
    setLoading(true);
    setError('');
    void gitClient
      .inspectCommitMessageEdit({ repoPath, commitHash })
      .then((result) => {
        if (generation.current !== current) return;
        if (!result.success) {
          setError(result.error);
          return;
        }
        setInspection(result.data);
        setTitle(result.data.title);
        setDescription(result.data.description);
      })
      .catch((failure: unknown) => {
        if (generation.current === current) setError(failure instanceof Error ? failure.message : String(failure));
      })
      .finally(() => {
        if (generation.current === current) setLoading(false);
      });
    return () => {
      generation.current = current + 1;
      if (operation.current) void gitClient.cancelCommitMessageEdit(operation.current).catch(() => {});
    };
  }, [repoPath, commitHash]);

  useEffect(
    () =>
      gitClient.onCommitMessageEditProgress((event) => {
        if (event.id !== operation.current || event.status !== 'progress') return;
        if (['checking', 'remotes', 'rewriting', 'verifying', 'publishing', 'cleanup'].includes(event.message || ''))
          setPhase(event.message as CommitMessageEditPhase);
      }),
    [],
  );

  useEffect(() => {
    if (inspection && !inspection.blockReason) titleRef.current?.focus();
  }, [inspection]);

  const unchanged = inspection && title === inspection.title && description === inspection.description;
  const disabled = loading || busy || !inspection || Boolean(inspection.blockReason) || !title.trim() || Boolean(unchanged);
  const submit = async () => {
    if (disabled || operation.current || !inspection) return;
    const current = generation.current;
    const operationId = crypto.randomUUID();
    operation.current = operationId;
    setBusy(true);
    setCancelling(false);
    setPhase('checking');
    setError('');
    try {
      const result = await gitClient.rewordCommitMessage({
        repoPath,
        commitHash,
        operationId,
        expectedHead: inspection.expectedHead,
        expectedBranch: inspection.expectedBranch,
        title,
        description,
      });
      if (generation.current !== current) return;
      if (!result.success) {
        setError(commitEditErrorText(result.error, tr));
        return;
      }
      onSaved(result.data);
    } catch (failure) {
      if (generation.current === current) setError(commitEditErrorText(failure instanceof Error ? failure.message : String(failure), tr));
    } finally {
      operation.current = null;
      if (generation.current === current) {
        setBusy(false);
        setCancelling(false);
      }
    }
  };
  const cancel = () => {
    if (!operation.current) {
      onClose();
      return;
    }
    if (phase === 'publishing' || phase === 'cleanup' || cancelling) return;
    setCancelling(true);
    void gitClient.cancelCommitMessageEdit(operation.current).catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : String(failure));
      setCancelling(false);
    });
  };

  return (
    <DialogFrame
      open
      title={tr('Commit-Nachricht bearbeiten', 'Edit commit message')}
      onClose={cancel}
      onConfirm={() => void submit()}
      onEnter={() => void submit()}
      confirmDisabled={disabled}
      closeOnBackdrop={!busy}
      confirmLabel={tr('Änderung übernehmen', 'Apply change')}
      cancelLabel={cancelling ? tr('Wird abgebrochen …', 'Cancelling …') : undefined}
      initialFocusRef={titleRef}
    >
      {loading && (
        <p role="status" className="dialog-message">
          {tr('Commit und Repository prüfen …', 'Checking commit and repository …')}
        </p>
      )}
      {inspection && (
        <>
          <dl className="dialog-context-list">
            <dt>{tr('Branch', 'Branch')}</dt>
            <dd>{inspection.expectedBranch.replace(/^refs\/heads\//, '') || '—'}</dd>
            <dt>Commit</dt>
            <dd>{commitHash.slice(0, 12)}</dd>
            <dt>{tr('Folgecommits', 'Following commits')}</dt>
            <dd>{inspection.commitCount ? inspection.commitCount - 1 : '—'}</dd>
          </dl>
          <div className="dialog-inputs">
            <label className="dialog-field">
              <span>{tr('Titel', 'Title')}</span>
              <input
                ref={titleRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={busy || Boolean(inspection.blockReason)}
                maxLength={100_000}
              />
            </label>
            <label className="dialog-field">
              <span>{tr('Beschreibung', 'Description')}</span>
              <textarea
                rows={6}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={busy || Boolean(inspection.blockReason)}
                maxLength={100_000}
              />
            </label>
          </div>
          <p className="dialog-message">
            {tr(
              'Dieser Commit und seine Folgecommits erhalten neue Hashes. Nur ungepushte Historie wird geändert. Eine Sicherung bleibt im Recovery Center erhalten.',
              'This commit and its descendants receive new hashes. Only unpublished history is changed. A backup remains available in the Recovery Center.',
            )}
          </p>
          {inspection.signedCommitCount > 0 && (
            <p className="dialog-impact" style={{ color: 'var(--status-warning)' }}>
              {tr(
                `${inspection.signedCommitCount} ${inspection.signedCommitCount === 1 ? 'Signatur kann' : 'Signaturen können'} nicht übernommen werden. Neue Commits werden entsprechend deiner Git-Signierkonfiguration signiert.`,
                `${inspection.signedCommitCount} ${inspection.signedCommitCount === 1 ? 'signature' : 'signatures'} cannot be preserved. New commits follow your Git signing configuration.`,
              )}
            </p>
          )}
          {inspection.blockReason && (
            <div role="alert" className="dialog-validation">
              {commitEditBlockText(inspection.blockReason, tr)}
              {inspection.blockDetail.includes(': ') && <p>{inspection.blockDetail.split(': ').slice(1).join(': ')}</p>}
            </div>
          )}
        </>
      )}
      {busy && (
        <p role="status" className="dialog-message">
          {commitEditPhaseText(phase, tr)}
        </p>
      )}
      {error && (
        <div role="alert" className="dialog-validation">
          {error}
        </div>
      )}
    </DialogFrame>
  );
}
