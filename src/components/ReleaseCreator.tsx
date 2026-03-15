import React, { useMemo } from 'react';
import { Sparkles, Tag } from 'lucide-react';
import { GitHubCreateReleaseParamsDto, GitHubReleaseContextDto, GitHubReleaseDto } from '../global';
import { useI18n } from '../i18n';
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
  const existingTagSet = useMemo(
    () => new Set((context?.existingTags || []).map((tag) => tag.toLowerCase())),
    [context?.existingTags],
  );
  const tagAlreadyExists = Boolean(normalizedTag && existingTagSet.has(normalizedTag));
  const suggestedTag = useMemo(
    () => suggestNextReleaseTag(context?.existingTags || []),
    [context?.existingTags],
  );

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ fontSize: '1rem', fontWeight: 700 }}>{tr('Release erstellen', 'Create release')}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {ownerRepo
            ? `${ownerRepo.owner}/${ownerRepo.repo}`
            : tr('Keine GitHub-Repository-Zuordnung gefunden.', 'No GitHub repository mapping found.')}
        </div>
      </div>

      <div className="repo-form-stack">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
          <input
            className="repo-filter-input"
            type="text"
            placeholder={tr('Tag-Name (Pflicht)', 'Tag name (required)')}
            value={releaseForm.tagName || ''}
            onChange={(event) => setReleaseForm((prev) => ({ ...prev, tagName: event.target.value }))}
            disabled={!ownerRepo || releaseSubmitting}
          />
          <button
            className="staging-btn-sm"
            onClick={() => setReleaseForm((prev) => ({ ...prev, tagName: suggestedTag, releaseName: prev.releaseName || `Release ${suggestedTag}` }))}
            disabled={!ownerRepo || releaseSubmitting}
            title={tr('Tag-Vorschlag uebernehmen', 'Apply suggested tag')}
          >
            <Tag size={12} style={{ marginRight: '4px' }} />
            {suggestedTag}
          </button>
        </div>

        {tagAlreadyExists && (
          <div className="repo-state-text" style={{ color: 'var(--status-warning)' }}>
            {tr('Dieser Tag existiert bereits.', 'This tag already exists.')}
          </div>
        )}

        <input
          className="repo-filter-input"
          type="text"
          placeholder={tr('Release-Name (Pflicht)', 'Release name (required)')}
          value={releaseForm.releaseName || ''}
          onChange={(event) => setReleaseForm((prev) => ({ ...prev, releaseName: event.target.value }))}
          disabled={!ownerRepo || releaseSubmitting}
        />
        <input
          className="repo-filter-input"
          type="text"
          placeholder={tr('Ziel-Branch oder Commit (optional)', 'Target branch or commit (optional)')}
          value={releaseForm.targetCommitish || ''}
          onChange={(event) => setReleaseForm((prev) => ({ ...prev, targetCommitish: event.target.value }))}
          disabled={!ownerRepo || releaseSubmitting}
        />
        <textarea
          className="repo-filter-input"
          placeholder={tr('Release Notes (Markdown)', 'Release notes (Markdown)')}
          value={releaseForm.body || ''}
          onChange={(event) => setReleaseForm((prev) => ({ ...prev, body: event.target.value }))}
          rows={12}
          disabled={!ownerRepo || releaseSubmitting}
          style={{ resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
        />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{tr('KI-Sprache', 'AI language')}</span>
            <select
              className="repo-filter-input"
              value={notesLanguage}
              onChange={(event) => setNotesLanguage(event.target.value === 'de' ? 'de' : 'en')}
              style={{ width: 'auto', minWidth: '130px', padding: '6px 8px' }}
              disabled={notesGenerating || releaseSubmitting}
            >
              <option value="en">{tr('Englisch', 'English')}</option>
              <option value="de">{tr('Deutsch', 'German')}</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px' }} className="repo-check-row">
            <label>
              <input
                type="checkbox"
                checked={Boolean(releaseForm.draft)}
                onChange={(event) => setReleaseForm((prev) => ({ ...prev, draft: event.target.checked }))}
                disabled={!ownerRepo || releaseSubmitting}
              />
              {tr('Entwurf', 'Draft')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(releaseForm.prerelease)}
                onChange={(event) => setReleaseForm((prev) => ({ ...prev, prerelease: event.target.checked }))}
                disabled={!ownerRepo || releaseSubmitting}
              />
              {tr('Pre-Release', 'Pre-release')}
            </label>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="staging-tool-btn" onClick={() => void onRefreshContext()} disabled={!ownerRepo || contextLoading || releaseSubmitting}>
              {contextLoading ? tr('Aktualisiere...', 'Refreshing...') : tr('Daten aktualisieren', 'Refresh data')}
            </button>
            <button className="staging-tool-btn" onClick={() => void onGenerateNotes()} disabled={!ownerRepo || notesGenerating || releaseSubmitting}>
              <Sparkles size={12} style={{ marginRight: '4px' }} />
              {notesGenerating ? tr('KI erstellt...', 'AI generating...') : tr('Release Notes mit KI', 'AI release notes')}
            </button>
            <button
              className="staging-tool-btn"
              onClick={() => { void onCreateRelease(); }}
              disabled={!ownerRepo || releaseSubmitting || tagAlreadyExists}
            >
              {releaseSubmitting ? tr('Erstelle...', 'Creating...') : tr('Release erstellen', 'Create release')}
            </button>
          </div>
        </div>

        {contextError && <div className="repo-state-text" style={{ color: 'var(--status-danger)' }}>{contextError}</div>}
        {context?.fallbackUsed && (
          <div className="repo-state-text" style={{ color: 'var(--status-warning)' }}>
            {tr('Letzter Release-Tag lokal nicht gefunden, Commit-Liste zeigt stattdessen aktuellen Verlauf.', 'Latest release tag was not found locally, showing recent commit history instead.')}
          </div>
        )}
        {releaseError && <div className="repo-state-text" style={{ color: 'var(--status-danger)' }}>{releaseError}</div>}
        {releaseSuccess && (
          <div className="repo-state-text" style={{ color: 'var(--status-success)' }}>
            {tr('Release erfolgreich erstellt.', 'Release created successfully.')} <a href={releaseSuccess.htmlUrl} target="_blank" rel="noreferrer">{tr('Release oeffnen', 'Open release')}</a>
          </div>
        )}
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-panel)' }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color)', fontSize: '0.78rem', fontWeight: 600 }}>
          {tr('Commit-Basis fuer KI (seit letztem Release)', 'Commit base for AI (since last release)')}
          {context?.lastReleaseTag ? `: ${context.lastReleaseTag}` : `: ${tr('kein vorheriges Release', 'no previous release')}`}
        </div>
        <div style={{ maxHeight: '220px', overflow: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {(context?.commitsSinceLastRelease || []).length === 0 && (
            <div className="repo-state-text">{tr('Keine Commits gefunden.', 'No commits found.')}</div>
          )}
          {(context?.commitsSinceLastRelease || []).map((commit) => (
            <div key={commit.hash} style={{ fontSize: '0.74rem', border: '1px solid var(--line-subtle)', borderRadius: '6px', padding: '6px 8px', backgroundColor: 'var(--bg-dark)' }}>
              <div style={{ fontWeight: 600 }}>{commit.subject}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{commit.shortHash} | {commit.author} | {commit.date}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
