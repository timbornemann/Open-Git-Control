import { useId, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';
import { MAX_RELEASE_NOTES_INSTRUCTIONS_LENGTH } from '@/shared/releaseNotesInstructions';
import type { useReleaseProjectInstructions } from './useReleaseProjectInstructions';
import './releaseNotesInstructions.css';

export type ReleaseNotesInstructionsModel = {
  project: ReturnType<typeof useReleaseProjectInstructions>;
  releaseInstructions: string;
  onReleaseChange: (value: string) => void;
};

export function ReleaseNotesInstructions({ model, disabled }: { model: ReleaseNotesInstructionsModel; disabled: boolean }) {
  const { tr } = useI18n();
  const { project } = model;
  const id = useId();
  const projectInput = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const close = () => {
    if (!project.saving) setOpen(false);
  };
  const save = async () => {
    if (await project.save(draft)) setOpen(false);
  };
  return (
    <div className="release-ai-instructions">
      <div className="release-ai-project-instructions">
        <div>
          <strong>{tr('Projektanweisungen', 'Project instructions')}</strong>
          <small>
            {project.value
              ? tr('Gespeichert · für alle Releases', 'Saved · for every release')
              : tr('Ton und Stil für alle Releases', 'Tone and style for every release')}
          </small>
        </div>
        <button
          type="button"
          className="release-ai-instructions-button"
          disabled={disabled || !project.available || project.loading || project.saving}
          onClick={() => {
            setDraft(project.value);
            setOpen(true);
          }}
          aria-label={tr('Projektanweisungen bearbeiten', 'Edit project instructions')}
        >
          <Settings2 size={14} aria-hidden="true" />
          {tr('Anpassen', 'Configure')}
        </button>
      </div>
      {project.error && !open && (
        <div className="release-ai-instructions-error" role="alert">
          {tr('Projektanweisungen konnten nicht geladen oder gespeichert werden.', 'Project instructions could not be loaded or saved.')} {project.error}
          <button type="button" className="release-ai-instructions-button" onClick={project.reload}>
            {tr('Erneut laden', 'Reload')}
          </button>
        </div>
      )}
      <label className="release-ai-instructions-field" htmlFor={`${id}-release`}>
        <span>{tr('Hinweise für diesen Release', 'Instructions for this release')}</span>
        <textarea
          id={`${id}-release`}
          className="release-input release-ai-instructions-input"
          data-release-instructions="release"
          rows={3}
          maxLength={MAX_RELEASE_NOTES_INSTRUCTIONS_LENGTH}
          disabled={disabled}
          value={model.releaseInstructions}
          onChange={(event) => model.onReleaseChange(event.target.value)}
          placeholder={tr(
            'Z. B. das neue Dashboard hervorheben und die Migration kurz erklären.',
            'E.g. highlight the new dashboard and briefly explain the migration.',
          )}
          aria-describedby={`${id}-release-help`}
        />
        <small id={`${id}-release-help`}>{tr('Optional · gilt nur für diesen Release.', 'Optional · applies only to this release.')}</small>
      </label>
      <DialogFrame
        open={open}
        title={tr('Projektanweisungen für Release-Texte', 'Project instructions for release notes')}
        onClose={close}
        onConfirm={() => void save()}
        confirmLabel={project.saving ? tr('Wird gespeichert …', 'Saving …') : tr('Für dieses Projekt speichern', 'Save for this project')}
        confirmDisabled={project.saving || draft === project.value}
        cancelLabel={tr('Abbrechen', 'Cancel')}
        closeOnBackdrop={!project.saving}
        initialFocusRef={projectInput}
      >
        <p className="dialog-message">
          {tr(
            'Diese Vorgaben werden dauerhaft für dieses Repository gespeichert und bei jeder KI-Generierung verwendet.',
            'These instructions are saved permanently for this repository and used for every AI generation.',
          )}
        </p>
        <label className="release-ai-instructions-field" htmlFor={`${id}-project`}>
          <span>{tr('Eigene Anweisungen', 'Custom instructions')}</span>
          <textarea
            ref={projectInput}
            id={`${id}-project`}
            className="release-input release-ai-instructions-input"
            data-release-instructions="project"
            rows={8}
            maxLength={MAX_RELEASE_NOTES_INSTRUCTIONS_LENGTH}
            disabled={project.saving}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={tr(
              'Z. B. sachlich und direkt schreiben, Nutzer duzen und Vorteile vor technischen Details nennen.',
              'E.g. write in a friendly, direct tone and describe user benefits before technical details.',
            )}
          />
        </label>
        {project.error && (
          <p className="release-ai-instructions-error" role="alert">
            {project.error}
          </p>
        )}
      </DialogFrame>
    </div>
  );
}
