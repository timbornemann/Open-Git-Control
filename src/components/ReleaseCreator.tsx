import React, { useMemo } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  GitBranch,
  RefreshCw,
  Sparkles,
  Tag,
  XCircle,
} from 'lucide-react';
import { GitHubCreateReleaseParamsDto, GitHubReleaseContextDto, GitHubReleaseDto } from '../global';
import { useI18n } from '../i18n';
import { validateGithubReleaseInput } from '../utils/githubReleaseValidation';
import { suggestNextReleaseTag } from '../utils/releaseTagSuggestion';

type Props = {
  ownerRepo: { owner: string; repo: string } | null;
  releaseForm: GitHubCreateReleaseParamsDto;
  setReleaseForm: (updater: (prev: GitHubCreateReleaseParamsDto) => GitHubCreateReleaseParamsDto) => void;
  releaseSubmitting: boolean;
  releaseError: string | null;
  releaseSuccess: GitHubReleaseDto | null;
  onCreateRelease: () => Promise<void>;
  contextLoading: boolean;
  contextError: string | null;
  context: GitHubReleaseContextDto | null;
  onRefreshContext: () => Promise<void>;
  onGenerateNotes: () => Promise<void>;
  notesGenerating: boolean;
  notesLanguage: 'de' | 'en';
  setNotesLanguage: (value: 'de' | 'en') => void;
};

export const ReleaseCreator: React.FC<Props> = ({
  ownerRepo,
  releaseForm,
  setReleaseForm,
  releaseSubmitting,
  releaseError,
  releaseSuccess,
  onCreateRelease,
  contextLoading,
  contextError,
  context,
  onRefreshContext,
  onGenerateNotes,
  notesGenerating,
  notesLanguage,
  setNotesLanguage,
}) => {
  const { tr } = useI18n();

  const normalizedTag = (releaseForm.tagName || '').trim().toLowerCase();
  const trimmedTagName = (releaseForm.tagName || '').trim();
  const trimmedTarget = (releaseForm.targetCommitish || '').trim();
  const existingTagSet = useMemo(
    () => new Set((context?.existingTags || []).map((tag) => tag.toLowerCase())),
    [context?.existingTags],
  );
  const tagAlreadyExists = Boolean(normalizedTag && existingTagSet.has(normalizedTag));
  const suggestedTag = useMemo(
    () => suggestNextReleaseTag(context?.existingTags || []),
    [context?.existingTags],
  );
  const validation = useMemo(
    () => validateGithubReleaseInput({
      tagName: releaseForm.tagName || '',
      releaseName: releaseForm.releaseName || '',
    }),
    [releaseForm.releaseName, releaseForm.tagName],
  );

  const validationMessage = useMemo(() => {
    if (validation.errors.tagName === 'release.validation.tagRequired') {
      return tr('Tag-Name darf nicht leer sein.', 'Tag name must not be empty.');
    }
    if (validation.errors.tagName === 'release.validation.tagInvalid') {
      return tr('Tag-Name enthaelt ungueltige Zeichen oder Leerzeichen.', 'Tag name contains invalid characters or whitespace.');
    }
    if (validation.errors.releaseName === 'release.validation.nameRequired') {
      return tr('Release-Name darf nicht leer sein.', 'Release name must not be empty.');
    }
    if (validation.errors.releaseName === 'release.validation.nameTooShort') {
      return tr('Release-Name ist zu kurz (mind. 3 Zeichen).', 'Release name is too short (min. 3 chars).');
    }
    return null;
  }, [tr, validation.errors.releaseName, validation.errors.tagName]);

  const commits = context?.commitsSinceLastRelease || [];
  const commitsCount = commits.length;
  const bodyLineCount = (releaseForm.body || '').split(/\r?\n/g).length;
  const bodyCharCount = (releaseForm.body || '').length;
  const canGenerateNotes = Boolean(ownerRepo) && !releaseSubmitting && !notesGenerating && Boolean(trimmedTagName) && commitsCount > 0;
  const canCreateRelease = Boolean(ownerRepo) && !releaseSubmitting && !tagAlreadyExists && validation.valid;
  const targetForContext = trimmedTarget || context?.commitsTarget || tr('Unbekannt', 'Unknown');

  const createHint = useMemo(() => {
    if (!ownerRepo) {
      return tr('Bitte zuerst ein Repository mit GitHub verknuepfen.', 'Please connect a repository to GitHub first.');
    }
    if (tagAlreadyExists) {
      return tr('Dieser Tag existiert bereits. Bitte einen neuen Tag vergeben.', 'This tag already exists. Please use a new tag.');
    }
    if (!validation.valid && validationMessage) {
      return validationMessage;
    }
    return tr('Die Release wird mit den aktuellen Angaben bei GitHub erstellt.', 'The release will be created on GitHub with the current inputs.');
  }, [ownerRepo, tagAlreadyExists, tr, validation.valid, validationMessage]);

  const aiHint = useMemo(() => {
    if (!ownerRepo) {
      return tr('KI-Notizen sind erst verfuegbar, wenn das Repository mit GitHub verbunden ist.', 'AI notes are available once the repository is connected to GitHub.');
    }
    if (!trimmedTagName) {
      return tr('Setze zuerst einen Tag-Name, damit KI-Notizen den Release-Kontext kennen.', 'Set a tag name first so AI notes know the release context.');
    }
    if (commitsCount === 0) {
      return tr('Keine Commits seit dem letzten Release gefunden.', 'No commits found since the last release.');
    }
    return tr('Die KI erstellt Notizen auf Basis der Commits aus dem rechten Bereich.', 'AI generates notes from the commit list shown on the right side.');
  }, [commitsCount, ownerRepo, trimmedTagName, tr]);

  return (
    <div className="release-creator">
      <section className="release-hero">
        <div className="release-hero-top">
          <div className="release-hero-copy">
            <div className="release-hero-eyebrow">{tr('Release Workflow', 'Release workflow')}</div>
            <h2 className="release-hero-title">{tr('Release strukturiert vorbereiten', 'Prepare release with clear steps')}</h2>
            <p className="release-hero-subtitle">
              {tr(
                'Fuehre Tag, Inhalt und Freigabe nacheinander aus. Alle wichtigen Kontexte sind direkt sichtbar.',
                'Go through tag, content, and publication in sequence. All key context is visible on one screen.',
              )}
            </p>
          </div>
          <div className="release-hero-repo">
            <span className="release-hero-repo-label">{tr('Repository', 'Repository')}</span>
            <span className="release-hero-repo-value">
              {ownerRepo
                ? `${ownerRepo.owner}/${ownerRepo.repo}`
                : tr('Keine GitHub-Repository-Zuordnung', 'No GitHub repository mapping')}
            </span>
          </div>
        </div>

        <div className="release-hero-stats">
          <div className="release-hero-stat">
            <span>{tr('Letztes Release', 'Last release')}</span>
            <strong>{context?.lastReleaseTag || tr('Keins', 'None')}</strong>
          </div>
          <div className="release-hero-stat">
            <span>{tr('Ziel', 'Target')}</span>
            <strong>{targetForContext}</strong>
          </div>
          <div className="release-hero-stat">
            <span>{tr('Commits seitdem', 'Commits since')}</span>
            <strong>{commitsCount}</strong>
          </div>
        </div>

        <div className="release-hero-actions">
          <button
            className="release-secondary-btn"
            onClick={() => void onRefreshContext()}
            disabled={!ownerRepo || contextLoading || releaseSubmitting}
          >
            <RefreshCw size={14} className={contextLoading ? 'spin' : ''} />
            {contextLoading ? tr('Aktualisiere...', 'Refreshing...') : tr('Kontext aktualisieren', 'Refresh context')}
          </button>
        </div>
      </section>

      {!ownerRepo && (
        <div className="release-alert release-alert--warning">
          <AlertCircle size={16} />
          <div>
            <strong>{tr('GitHub-Zuordnung fehlt.', 'GitHub mapping missing.')}</strong>
            <p>
              {tr(
                'Oeffne ein lokal mit GitHub verbundenes Repository, damit Releases erstellt werden koennen.',
                'Open a local repository connected to GitHub to create releases.',
              )}
            </p>
          </div>
        </div>
      )}

      {contextError && (
        <div className="release-alert release-alert--danger">
          <XCircle size={16} />
          <div>{contextError}</div>
        </div>
      )}

      {context?.fallbackUsed && (
        <div className="release-alert release-alert--warning">
          <AlertCircle size={16} />
          <div>
            {tr(
              'Letzter Release-Tag lokal nicht gefunden. Es wird stattdessen aktueller Verlauf verwendet.',
              'Latest release tag was not found locally. Showing recent history instead.',
            )}
          </div>
        </div>
      )}

      {releaseError && (
        <div className="release-alert release-alert--danger">
          <XCircle size={16} />
          <div>{releaseError}</div>
        </div>
      )}

      {releaseSuccess && (
        <div className="release-alert release-alert--success">
          <CheckCircle2 size={16} />
          <div>
            {tr('Release erfolgreich erstellt.', 'Release created successfully.')}{' '}
            <a href={releaseSuccess.htmlUrl} target="_blank" rel="noreferrer" className="release-alert-link">
              {tr('Release oeffnen', 'Open release')} <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}

      <div className="release-layout">
        <div className="release-column-main">
          <section className="release-card">
            <div className="release-card-head">
              <div>
                <div className="release-step-id">{tr('Schritt 1', 'Step 1')}</div>
                <h3>{tr('Version und Ziel definieren', 'Define version and target')}</h3>
              </div>
            </div>

            <div className="release-form-grid">
              <label className="release-field">
                <span className="release-field-label">{tr('Tag-Name (Pflicht)', 'Tag name (required)')}</span>
                <input
                  type="text"
                  className="release-input"
                  value={releaseForm.tagName || ''}
                  onChange={(event) => setReleaseForm((prev) => ({ ...prev, tagName: event.target.value }))}
                  disabled={!ownerRepo || releaseSubmitting}
                  placeholder={tr('z.B. v1.2.0', 'e.g. v1.2.0')}
                />
              </label>
              <button
                className="release-tag-btn"
                onClick={() => setReleaseForm((prev) => ({
                  ...prev,
                  tagName: suggestedTag,
                  releaseName: prev.releaseName || `Release ${suggestedTag}`,
                }))}
                disabled={!ownerRepo || releaseSubmitting}
                title={tr('Tag-Vorschlag uebernehmen', 'Apply suggested tag')}
              >
                <Tag size={14} />
                {suggestedTag}
              </button>
              <label className="release-field release-field--full">
                <span className="release-field-label">{tr('Release-Name (Pflicht)', 'Release name (required)')}</span>
                <input
                  type="text"
                  className="release-input"
                  value={releaseForm.releaseName || ''}
                  onChange={(event) => setReleaseForm((prev) => ({ ...prev, releaseName: event.target.value }))}
                  disabled={!ownerRepo || releaseSubmitting}
                  placeholder={tr('z.B. Release v1.2.0', 'e.g. Release v1.2.0')}
                />
              </label>
              <label className="release-field release-field--full">
                <span className="release-field-label">{tr('Ziel-Branch oder Commit (optional)', 'Target branch or commit (optional)')}</span>
                <input
                  type="text"
                  className="release-input"
                  value={releaseForm.targetCommitish || ''}
                  onChange={(event) => setReleaseForm((prev) => ({ ...prev, targetCommitish: event.target.value }))}
                  disabled={!ownerRepo || releaseSubmitting}
                  placeholder={tr('z.B. main oder SHA', 'e.g. main or SHA')}
                />
              </label>
            </div>

            {tagAlreadyExists ? (
              <p className="release-inline release-inline--warning">
                <XCircle size={13} />
                {tr('Dieser Tag existiert bereits.', 'This tag already exists.')}
              </p>
            ) : validationMessage ? (
              <p className="release-inline release-inline--warning">
                <AlertCircle size={13} />
                {validationMessage}
              </p>
            ) : (
              <p className="release-inline release-inline--muted">
                <Check size={13} />
                {tr('Version und Name sind gueltig vorbereitet.', 'Version and name are ready.')}
              </p>
            )}
          </section>

          <section className="release-card">
            <div className="release-card-head release-card-head--split">
              <div>
                <div className="release-step-id">{tr('Schritt 2', 'Step 2')}</div>
                <h3>{tr('Release Notes schreiben', 'Write release notes')}</h3>
              </div>
              <div className="release-notes-actions">
                <div className="release-language-wrap">
                  <label htmlFor="release-language">{tr('KI-Sprache', 'AI language')}</label>
                  <select
                    id="release-language"
                    className="release-select"
                    value={notesLanguage}
                    onChange={(event) => setNotesLanguage(event.target.value === 'de' ? 'de' : 'en')}
                    disabled={notesGenerating || releaseSubmitting}
                  >
                    <option value="en">{tr('Englisch', 'English')}</option>
                    <option value="de">{tr('Deutsch', 'German')}</option>
                  </select>
                </div>
                <button
                  className="release-secondary-btn release-secondary-btn--accent"
                  onClick={() => void onGenerateNotes()}
                  disabled={!canGenerateNotes}
                >
                  <Sparkles size={14} />
                  {notesGenerating ? tr('KI erstellt...', 'AI generating...') : tr('KI Notes erstellen', 'Generate AI notes')}
                </button>
              </div>
            </div>

            <p className="release-inline release-inline--muted">
              <Sparkles size={13} />
              {aiHint}
            </p>

            <label className="release-field release-field--full">
              <span className="release-field-label">{tr('Release Notes (Markdown)', 'Release notes (Markdown)')}</span>
              <textarea
                className="release-textarea"
                value={releaseForm.body || ''}
                onChange={(event) => setReleaseForm((prev) => ({ ...prev, body: event.target.value }))}
                rows={14}
                disabled={!ownerRepo || releaseSubmitting}
                placeholder={tr(
                  '- Added\n- Changed\n- Fixed',
                  '- Added\n- Changed\n- Fixed',
                )}
              />
            </label>

            <div className="release-notes-meta">
              <span>{tr('Zeilen', 'Lines')}: {bodyLineCount}</span>
              <span>{tr('Zeichen', 'Characters')}: {bodyCharCount}</span>
            </div>
          </section>

          <section className="release-card">
            <div className="release-card-head">
              <div>
                <div className="release-step-id">{tr('Schritt 3', 'Step 3')}</div>
                <h3>{tr('Freigabe-Optionen und Erstellung', 'Release options and creation')}</h3>
              </div>
            </div>

            <div className="release-options-grid">
              <label className="release-option-card">
                <input
                  type="checkbox"
                  checked={Boolean(releaseForm.draft)}
                  onChange={(event) => setReleaseForm((prev) => ({ ...prev, draft: event.target.checked }))}
                  disabled={!ownerRepo || releaseSubmitting}
                />
                <span className="release-option-copy">
                  <strong>{tr('Entwurf', 'Draft')}</strong>
                  <small>
                    {tr(
                      'Release speichern, aber nicht sofort veroeffentlichen.',
                      'Save the release without publishing it immediately.',
                    )}
                  </small>
                </span>
              </label>
              <label className="release-option-card">
                <input
                  type="checkbox"
                  checked={Boolean(releaseForm.prerelease)}
                  onChange={(event) => setReleaseForm((prev) => ({ ...prev, prerelease: event.target.checked }))}
                  disabled={!ownerRepo || releaseSubmitting}
                />
                <span className="release-option-copy">
                  <strong>{tr('Pre-Release', 'Pre-release')}</strong>
                  <small>
                    {tr(
                      'Kennzeichnet die Version als Vorabstatus (beta/rc).',
                      'Marks this version as an early preview (beta/rc).',
                    )}
                  </small>
                </span>
              </label>
            </div>

            <button
              className="release-primary-btn"
              onClick={() => { void onCreateRelease(); }}
              disabled={!canCreateRelease}
            >
              <Check size={14} />
              {releaseSubmitting ? tr('Erstelle Release...', 'Creating release...') : tr('Release erstellen', 'Create release')}
            </button>

            <p className={`release-inline ${canCreateRelease ? 'release-inline--muted' : 'release-inline--warning'}`}>
              {canCreateRelease ? <Check size={13} /> : <AlertCircle size={13} />}
              {createHint}
            </p>
          </section>
        </div>

        <aside className="release-column-side">
          <section className="release-card">
            <div className="release-card-head release-card-head--split">
              <div>
                <div className="release-step-id">{tr('Kontext', 'Context')}</div>
                <h3>{tr('Release-Basis', 'Release baseline')}</h3>
              </div>
              <button
                className="release-icon-btn"
                onClick={() => void onRefreshContext()}
                disabled={!ownerRepo || contextLoading || releaseSubmitting}
                title={tr('Daten aktualisieren', 'Refresh data')}
              >
                <RefreshCw size={14} className={contextLoading ? 'spin' : ''} />
              </button>
            </div>

            <div className="release-context-grid">
              <div className="release-context-cell">
                <span>{tr('Letzter Tag', 'Last tag')}</span>
                <strong>{context?.lastReleaseTag || tr('Kein Release', 'No release')}</strong>
              </div>
              <div className="release-context-cell">
                <span>{tr('Target', 'Target')}</span>
                <strong>{targetForContext}</strong>
              </div>
              <div className="release-context-cell">
                <span>{tr('Commits fuer KI', 'Commits for AI')}</span>
                <strong>{commitsCount}</strong>
              </div>
            </div>
          </section>

          <section className="release-card release-card--stretch">
            <div className="release-card-head">
              <div>
                <div className="release-step-id">{tr('Historie', 'History')}</div>
                <h3>{tr('Commits seit letztem Release', 'Commits since last release')}</h3>
              </div>
            </div>

            <div className="release-commit-list">
              {commitsCount === 0 && (
                <div className="release-empty-state">
                  <GitBranch size={16} />
                  {tr('Keine Commits gefunden.', 'No commits found.')}
                </div>
              )}
              {commits.map((commit) => (
                <article key={commit.hash} className="release-commit-item">
                  <div className="release-commit-subject">{commit.subject}</div>
                  <div className="release-commit-meta">
                    <code>{commit.shortHash}</code>
                    <span>{commit.author}</span>
                    <span><Clock3 size={11} /> {commit.date}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
