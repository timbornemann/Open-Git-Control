import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { githubClient } from '@/services/githubClient';
import type { GithubCreateRepositoryWithReadmeDto } from '@/types/githubDtos';

type Props = {
  onClose: () => void;
  onCreated: (result: GithubCreateRepositoryWithReadmeDto) => void;
};

export const GithubCreateRepoDialog: React.FC<Props> = ({ onClose, onCreated }) => {
  const { tr } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLFormElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape' && !submitting) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)') || [])];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await githubClient.createRepositoryWithReadme(name.trim(), description.trim(), isPrivate);
      if (!result.success) throw new Error(result.error || tr('Repository konnte nicht erstellt werden.', 'Repository could not be created.'));
      onCreated(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="github-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <form
        ref={dialogRef}
        className="github-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-create-title"
        onKeyDown={handleKeyDown}
        onSubmit={(event) => void submit(event)}
      >
        <div className="github-dialog__head">
          <div>
            <span className="github-workspace__eyebrow">GITHUB</span>
            <h2 id="github-create-title">{tr('Neues Remote-Repository', 'New remote repository')}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label={tr('Schließen', 'Close')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p>
          {tr(
            'Das Repo wird in deinem persönlichen GitHub-Konto erstellt. GitHub legt zuerst eine README an; anschließend ersetzt die App sie durch die Open-Git-Control-Vorlage.',
            'The repository will be created in your personal GitHub account. GitHub creates an initial README, then the app replaces it with the Open Git Control template.',
          )}
        </p>
        <label>
          {tr('Repository-Name', 'Repository name')}
          <input
            autoFocus
            required
            maxLength={100}
            pattern="[A-Za-z0-9._-]+"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="my-project"
          />
        </label>
        <label>
          {tr('Beschreibung', 'Description')}
          <textarea
            rows={3}
            maxLength={350}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={tr('Worum geht es in diesem Projekt?', 'What is this project about?')}
          />
        </label>
        <fieldset>
          <legend>{tr('Sichtbarkeit', 'Visibility')}</legend>
          <label>
            <input type="radio" checked={isPrivate} onChange={() => setIsPrivate(true)} /> {tr('Privat', 'Private')}
          </label>
          <label>
            <input type="radio" checked={!isPrivate} onChange={() => setIsPrivate(false)} /> {tr('Öffentlich', 'Public')}
          </label>
        </fieldset>
        {error && (
          <p className="github-workspace__error" role="alert">
            {error}
          </p>
        )}
        <div className="github-dialog__actions">
          <button type="button" onClick={onClose} disabled={submitting}>
            {tr('Abbrechen', 'Cancel')}
          </button>
          <button className="github-workspace__primary" type="submit" disabled={!name.trim() || submitting}>
            {submitting ? tr('Erstelle …', 'Creating …') : tr('Repository erstellen', 'Create repository')}
          </button>
        </div>
      </form>
    </div>
  );
};
