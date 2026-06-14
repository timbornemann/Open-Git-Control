import React, { useMemo, useState } from 'react';
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
import { ReleaseNotesOptions } from '../types/releaseNotes';
import { validateGithubReleaseInput } from '../utils/githubReleaseValidation';
import {
  detectReleaseVersionBump,
  ReleaseVersionBump,
  suggestNextReleaseTag,
} from '../utils/releaseTagSuggestion';

type AiOptionToggleProps = {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
};

const AiOptionToggle: React.FC<AiOptionToggleProps> = ({
  label,
  description,
  checked,
  disabled,
  onChange,
}) => (
  <label className={`release-ai-option ${disabled ? 'release-ai-option--disabled' : ''}`}>
    <span className="release-ai-option-text">
      <strong>{label}</strong>
      <small>{description}</small>
    </span>
    <span className="release-switch">
      <input
        type="checkbox"
        className="release-switch-input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="release-switch-track">
        <span className="release-switch-thumb" />
      </span>
    </span>
  </label>
);

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
  onGenerateNotes: (versionBump: ReleaseVersionBump) => Promise<void>;
  notesGenerating: boolean;
  notesLanguage: 'de' | 'en';
  setNotesLanguage: (value: 'de' | 'en') => void;
  notesOptions: ReleaseNotesOptions;
  setNotesOptions: (updater: (prev: ReleaseNotesOptions) => ReleaseNotesOptions) => void;
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
  notesOptions,
  setNotesOptions,
}) => {
  const { tr } = useI18n();
  const [versionBump, setVersionBump] = useState<ReleaseVersionBump>('patch');

  const normalizedTag = (releaseForm.tagName || '').trim().toLowerCase();
  const trimmedTagName = (releaseForm.tagName || '').trim();
  const trimmedTarget = (releaseForm.targetCommitish || '').trim();

  const existingTagSet = useMemo(
    () => new Set((context?.existingTags || []).map((tag) => tag.toLowerCase())),
    [context?.existingTags],
  );
  const tagAlreadyExists = Boolean(normalizedTag && existingTagSet.has(normalizedTag));
  const suggestedTag = useMemo(
    () => suggestNextReleaseTag(context?.existingTags || [], versionBump),
    [context?.existingTags, versionBump],
  );
  const effectiveVersionBump = useMemo(
    () => detectReleaseVersionBump(context?.lastReleaseTag, trimmedTagName) || versionBump,
    [context?.lastReleaseTag, trimmedTagName, versionBump],
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
  const targetForContext = trimmedTarget || context?.commitsTarget || tr('Unbekannt', 'Unknown');
  const repositoryLabel = ownerRepo
    ? `${ownerRepo.owner}/${ownerRepo.repo}`
    : tr('Keine GitHub-Repository-Zuordnung', 'No GitHub repository mapping');

  const canGenerateNotes = Boolean(ownerRepo) && !releaseSubmitting && !notesGenerating && Boolean(trimmedTagName) && commitsCount > 0;
  const canCreateRelease = Boolean(ownerRepo) && !releaseSubmitting && !tagAlreadyExists && validation.valid;

  const applySuggestedTag = (nextTag: string) => {
    setReleaseForm((prev) => {
      const currentTag = (prev.tagName || '').trim();
      const currentReleaseName = (prev.releaseName || '').trim();
      const shouldUpdateReleaseName = (
        !currentReleaseName
        || currentReleaseName === `Release ${currentTag}`
      );

      return {
        ...prev,
        tagName: nextTag,
        releaseName: shouldUpdateReleaseName ? `Release ${nextTag}` : prev.releaseName,
      };
    });
  };

  const selectVersionBump = (nextBump: ReleaseVersionBump) => {
    setVersionBump(nextBump);
    applySuggestedTag(suggestNextReleaseTag(context?.existingTags || [], nextBump));
  };

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

  return (
    <div className="release-creator release-creator--clean">
      <div className="release-layout-clean">
        <main className="release-main-clean">
          <header className="release-head-clean">
            <div>
              <p className="release-eyebrow">{tr('Release Workflow', 'Release workflow')}</p>
              <h1 className="release-title-clean">{tr('Release erstellen', 'Create release')}</h1>
              <p className="release-subtitle-clean">
                {tr(
                  'Version festlegen, Release Notes erstellen und direkt veroeffentlichen.',
                  'Define version, create release notes, and publish in one flow.',
                )}
              </p>
            </div>
            <div className="release-repo-chip" title={repositoryLabel}>{repositoryLabel}</div>
          </header>

          <section className="release-info-bar">
            <div className="release-info-item">
              <span>{tr('Letztes Release', 'Last release')}</span>
              <strong>{context?.lastReleaseTag || tr('Keins', 'None')}</strong>
            </div>
            <div className="release-info-item">
              <span>{tr('Target', 'Target')}</span>
              <strong>{targetForContext}</strong>
            </div>
            <div className="release-info-item">
              <span>{tr('Commits seitdem', 'Commits since')}</span>
              <strong>{commitsCount}</strong>
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

          <section className="release-form-shell">
            <section className="release-step-clean">
              <header className="release-step-title-row">
                <h2>{tr('1. Version und Ziel', '1. Version and target')}</h2>
              </header>

              <div className="release-version-bump">
                <div className="release-version-bump-copy">
                  <span className="release-field-label">{tr('Versionssprung', 'Version bump')}</span>
                  <small>
                    {tr(
                      'Legt fest, welche Stelle erhoeht und wie das Release in den KI-Notizen bezeichnet wird.',
                      'Controls which component is increased and how AI notes classify the release.',
                    )}
                  </small>
                </div>
                <div
                  className="release-version-bump-options"
                  role="group"
                  aria-label={tr('Versionssprung auswaehlen', 'Select version bump')}
                >
                  {(['major', 'minor', 'patch'] as ReleaseVersionBump[]).map((bump) => (
                    <button
                      key={bump}
                      type="button"
                      className={`release-version-bump-btn ${versionBump === bump ? 'release-version-bump-btn--active' : ''}`}
                      aria-pressed={versionBump === bump}
                      onClick={() => selectVersionBump(bump)}
                      disabled={!ownerRepo || releaseSubmitting}
                    >
                      {bump === 'major' ? 'Major' : bump === 'minor' ? 'Minor' : 'Patch'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="release-field-grid">
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
                  onClick={() => applySuggestedTag(suggestedTag)}
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

            <section className="release-step-clean release-step-clean--notes-workbench">
              <header className="release-step-title-row">
                <h2>{tr('2. Release Notes und Publish', '2. Release notes and publish')}</h2>
              </header>

              <div className="release-notes-workbench">
                <aside className="release-notes-side">
                  <div className="release-ai-panel">
                    <div className="release-ai-headline">
                      <div className="release-ai-headline-copy">
                        <strong>{tr('Tune AI notes', 'Tune AI notes')}</strong>
                        <span>{tr('Verhalten feinsteuern und dann generieren.', 'Adjust behavior and generate.')}</span>
                      </div>
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
                    </div>

                    <div className="release-ai-options-list">
                      <AiOptionToggle
                        label={tr('Merge-Commits ausblenden', 'Exclude merge commits')}
                        description={tr('Weniger Rauschen in den KI-Notizen.', 'Reduce noise in AI notes.')}
                        checked={notesOptions.omitMergeCommits}
                        onChange={(next) => setNotesOptions((prev) => ({ ...prev, omitMergeCommits: next }))}
                        disabled={notesGenerating || releaseSubmitting}
                      />
                      <AiOptionToggle
                        label={tr('Nach Bereichen gruppieren', 'Group into sections')}
                        description={tr('Z.B. Added, Changed, Fixed.', 'E.g. Added, Changed, Fixed.')}
                        checked={notesOptions.preferGroupedSections}
                        onChange={(next) => setNotesOptions((prev) => ({ ...prev, preferGroupedSections: next }))}
                        disabled={notesGenerating || releaseSubmitting}
                      />
                      <AiOptionToggle
                        label={tr('Mehr technische Details', 'More technical details')}
                        description={tr('Fokus auf technische Aenderungen.', 'Focus on technical changes.')}
                        checked={notesOptions.includeTechnicalDetails}
                        onChange={(next) => setNotesOptions((prev) => ({ ...prev, includeTechnicalDetails: next }))}
                        disabled={notesGenerating || releaseSubmitting}
                      />
                      <AiOptionToggle
                        label={tr('Breaking-Changes-Abschnitt', 'Breaking changes section')}
                        description={tr('Wird immer als eigener Abschnitt behandelt.', 'Always handled as a separate section.')}
                        checked={notesOptions.includeBreakingChangesSection}
                        onChange={(next) => setNotesOptions((prev) => ({ ...prev, includeBreakingChangesSection: next }))}
                        disabled={notesGenerating || releaseSubmitting}
                      />
                      <AiOptionToggle
                        label={tr('Automatische Commit-Liste anhaengen', 'Append automatic commit list')}
                        description={tr('Wird lokal ohne KI erzeugt.', 'Generated locally without AI.')}
                        checked={notesOptions.appendAlgorithmicChangeList}
                        onChange={(next) => setNotesOptions((prev) => ({ ...prev, appendAlgorithmicChangeList: next }))}
                        disabled={notesGenerating || releaseSubmitting}
                      />
                      <AiOptionToggle
                        label={tr('Commit-Hashes anzeigen', 'Show commit hashes')}
                        description={tr('Nur fuer die automatische Commit-Liste.', 'Only for the automatic commit list.')}
                        checked={notesOptions.includeHashesInAlgorithmicList}
                        onChange={(next) => setNotesOptions((prev) => ({ ...prev, includeHashesInAlgorithmicList: next }))}
                        disabled={notesGenerating || releaseSubmitting || !notesOptions.appendAlgorithmicChangeList}
                      />
                    </div>

                    <div className="release-ai-main-actions">
                      <button
                        className="release-ai-generate-btn"
                        onClick={() => void onGenerateNotes(effectiveVersionBump)}
                        disabled={!canGenerateNotes}
                      >
                        <Sparkles size={16} />
                        {notesGenerating ? tr('KI erstellt Release Notes...', 'AI is generating release notes...') : tr('Release Notes mit KI generieren', 'Generate release notes with AI')}
                      </button>
                    </div>
                  </div>

                  <div className="release-publish-panel">
                    <header className="release-publish-head">
                      <h3>{tr('3. Veroeffentlichen', '3. Publish')}</h3>
                    </header>

                    <div className="release-options-grid release-options-grid--compact">
                      <label className="release-option-card">
                        <input
                          type="checkbox"
                          checked={Boolean(releaseForm.draft)}
                          onChange={(event) => setReleaseForm((prev) => ({ ...prev, draft: event.target.checked }))}
                          disabled={!ownerRepo || releaseSubmitting}
                        />
                        <span className="release-option-copy">
                          <strong>{tr('Entwurf', 'Draft')}</strong>
                          <small>{tr('Release speichern, aber nicht sofort veroeffentlichen.', 'Save the release without publishing it immediately.')}</small>
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
                          <small>{tr('Kennzeichnet die Version als Vorabstatus (beta/rc).', 'Marks this version as an early preview (beta/rc).')}</small>
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
                  </div>
                </aside>

                <div className="release-notes-editor-pane">
                  <label className="release-field release-field--full release-field--editor">
                    <span className="release-field-label">{tr('Release Notes (Markdown)', 'Release notes (Markdown)')}</span>
                    <textarea
                      className="release-textarea release-textarea--editor"
                      value={releaseForm.body || ''}
                      onChange={(event) => setReleaseForm((prev) => ({ ...prev, body: event.target.value }))}
                      rows={20}
                      disabled={!ownerRepo || releaseSubmitting}
                      placeholder={tr('- Added\n- Changed\n- Fixed', '- Added\n- Changed\n- Fixed')}
                    />
                  </label>

                  <div className="release-notes-meta">
                    <span>{tr('Zeilen', 'Lines')}: {bodyLineCount}</span>
                    <span>{tr('Zeichen', 'Characters')}: {bodyCharCount}</span>
                  </div>
                </div>
              </div>
            </section>
          </section>
        </main>

        <aside className="release-history-panel">
          <div className="release-history-toolbar">
            <div className="release-history-toolbar-copy">
              <span className="release-eyebrow">{tr('History', 'History')}</span>
              <strong>{tr('Commits seit letztem Release', 'Commits since last release')}</strong>
            </div>
            <button
              className="staging-tool-btn"
              onClick={() => void onRefreshContext()}
              disabled={!ownerRepo || contextLoading || releaseSubmitting}
              title={tr('Daten aktualisieren', 'Refresh data')}
            >
              <RefreshCw size={12} className={contextLoading ? 'spin' : ''} />
              {contextLoading ? tr('Aktualisiere...', 'Refreshing...') : tr('Aktualisieren', 'Refresh')}
            </button>
          </div>
          <div className="release-history-scroll">
            {commitsCount === 0 && (
              <div className="release-empty-state">
                <GitBranch size={16} />
                {tr('Keine Commits gefunden.', 'No commits found.')}
              </div>
            )}
            {commits.map((commit) => (
              <div key={commit.hash} className="release-history-row">
                <div className="release-history-row-subject">{commit.subject}</div>
                <div className="release-history-row-meta">
                  <code>{commit.shortHash}</code>
                  <span>{commit.author}</span>
                  <span><Clock3 size={11} /> {commit.date}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};
