import React, { useEffect, useState } from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { gitClient } from '@/services/gitClient';
import type { WorkingDirectoryFileInfoDto } from '@/shared/ipc/contracts/git';
import type { GitFileHistoryEntryDto } from '@/types/git';
import '@/styles/working-directory-tree.css';

type Props = {
  repoPath: string;
  path: string;
  onClose: () => void;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes.toLocaleString()} bytes`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
};

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
};

const getGitStatusLabel = (info: WorkingDirectoryFileInfoDto['git']): string => {
  if (info.ignored) return 'Ignored';
  if (!info.tracked) return 'Untracked';
  if (info.conflicted) return 'Conflicted';
  if (info.staged && info.modified) return 'Staged and modified';
  if (info.staged) return 'Staged';
  if (info.modified) return 'Modified';
  return 'Tracked and clean';
};

const CommitSummary: React.FC<{ label: string; commit: GitFileHistoryEntryDto }> = ({ label, commit }) => (
  <div className="working-file-info__commit">
    <span className="working-file-info__commit-label">{label}</span>
    <strong title={commit.hash}>{commit.abbrevHash}</strong>
    <span>{commit.subject || '(no commit message)'}</span>
    <small>
      {commit.author} · {formatDate(commit.date)}
    </small>
  </div>
);

export const WorkingDirectoryFileInfoDialog: React.FC<Props> = ({ repoPath, path, onClose }) => {
  const [info, setInfo] = useState<WorkingDirectoryFileInfoDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setInfo(null);
    setError(null);
    setLoading(true);
    void gitClient
      .getWorkingDirectoryFileInfo(path, repoPath)
      .then((result) => {
        if (!active) return;
        if (result.success && result.data) {
          setInfo(result.data);
          return;
        }
        setError(result.error || 'Could not load file information.');
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load file information.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, repoPath]);

  return (
    <DialogFrame open={true} title="File information" onClose={onClose} cancelLabel="Close">
      {loading && <p className="working-file-info__loading">Loading file information…</p>}
      {error && <p className="working-file-info__error">{error}</p>}
      {info && (
        <>
          <section className="working-file-info__section" aria-labelledby="working-file-info-file">
            <h4 id="working-file-info-file">File</h4>
            <dl className="working-file-info__list">
              <dt>Path</dt>
              <dd>{info.path}</dd>
              <dt>Type</dt>
              <dd>{info.extension ? `.${info.extension} file` : 'File without extension'}</dd>
              <dt>Size</dt>
              <dd>{formatBytes(info.bytes)}</dd>
              <dt>Created</dt>
              <dd>{formatDate(info.createdAt)}</dd>
              <dt>Modified</dt>
              <dd>{formatDate(info.modifiedAt)}</dd>
              <dt>Last accessed</dt>
              <dd>{formatDate(info.accessedAt)}</dd>
              <dt>Writable</dt>
              <dd>{info.readOnly ? 'No' : 'Yes'}</dd>
            </dl>
            {info.hashes && (
              <dl className="working-file-info__list">
                <dt>SHA-256</dt>
                <dd>{info.hashes.sha256}</dd>
                <dt>SHA-1</dt>
                <dd>{info.hashes.sha1}</dd>
                <dt>MD5</dt>
                <dd>{info.hashes.md5}</dd>
              </dl>
            )}
            {info.hashError && <p className="working-file-info__error">Hashes could not be calculated: {info.hashError}</p>}
          </section>

          <section className="working-file-info__section" aria-labelledby="working-file-info-git">
            <h4 id="working-file-info-git">Git</h4>
            <dl className="working-file-info__list">
              <dt>Status</dt>
              <dd>{getGitStatusLabel(info.git)}</dd>
              <dt>Changes in history</dt>
              <dd>{info.git.historyCount.toLocaleString()}</dd>
            </dl>
            {info.git.firstCommit ? (
              <CommitSummary label="First added to Git" commit={info.git.firstCommit} />
            ) : (
              <p className="working-file-info__empty">No Git history is available for this file.</p>
            )}
            {info.git.latestCommit && <CommitSummary label="Latest change" commit={info.git.latestCommit} />}
            {info.git.error && <p className="working-file-info__error">Git information could not be fully loaded: {info.git.error}</p>}
          </section>
        </>
      )}
    </DialogFrame>
  );
};
