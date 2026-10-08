import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepositoryContext } from '@/contexts/AppStateContext';
import { repositorySecretScanAllowlistClient } from '@/services/repositorySecretScanAllowlistClient';
import { SECRET_SCAN_ALLOWLIST_PATH, type RepositorySecretScanAllowlistDto } from '@/types/repositorySecretScanAllowlist';
import { validateSecretScanAllowlist } from '@/shared/secretScanAllowlistValidation';
import './repository-security.css';

type Draft = { text: string; version: string; savedText: string };
const drafts = new Map<string, Draft>();

export function RepositorySecretScanAllowlistView() {
  const { activeRepo, triggerRefresh, onToast } = useRepositoryContext();
  const { tr } = useI18n();
  const [draft, setDraft] = useState<Draft | null>(() => (activeRepo ? (drafts.get(activeRepo) ?? null) : null));
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirty = Boolean(draft && draft.text !== draft.savedText);
  const showError = (error: unknown) =>
    onToast(error instanceof Error ? error.message : tr('Allowlist konnte nicht geladen werden.', 'Could not load allowlist.'), true);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    setDraft(activeRepo ? (drafts.get(activeRepo) ?? null) : null);
    setBusy(false);
    setLoaded(false);
    if (!activeRepo || !repositorySecretScanAllowlistClient.isAvailable()) return;
    let readId = 0;
    const apply = (value: RepositorySecretScanAllowlistDto) => {
      const previous = drafts.get(activeRepo);
      if (previous && previous.text !== previous.savedText) return;
      const next = { text: value.text, savedText: value.text, version: value.version };
      drafts.set(activeRepo, next);
      setDraft(next);
    };
    const read = async () => {
      const id = ++readId;
      try {
        const result = await repositorySecretScanAllowlistClient.get(activeRepo);
        if (generation.current !== currentGeneration || id !== readId) return;
        if (!result.success) throw new Error(result.error);
        apply(result.data);
        if (result.data.validationError) showError(new Error(result.data.validationError));
      } catch (error) {
        if (generation.current === currentGeneration && id === readId) showError(error);
      } finally {
        if (generation.current === currentGeneration && id === readId) setLoaded(true);
      }
    };
    void read();
    const unsubscribe = repositorySecretScanAllowlistClient.onChanged((repoPath) => {
      if (repoPath === activeRepo) void read();
    });
    return () => {
      generation.current = currentGeneration + 1;
      unsubscribe();
    };
    // Notifications/translations do not change the repository identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRepo]);

  const save = async () => {
    if (!activeRepo || !draft || busy) return;
    const repoPath = activeRepo;
    const currentGeneration = generation.current;
    const text = draft.text;
    setBusy(true);
    try {
      validateSecretScanAllowlist(text);
      const result = await repositorySecretScanAllowlistClient.save({ repoPath, text, expectedVersion: draft.version });
      if (generation.current !== currentGeneration) return;
      if (!result.success) throw new Error(result.error);
      const next = { text: draftRef.current?.text ?? text, savedText: result.data.text, version: result.data.version };
      drafts.set(repoPath, next);
      setDraft(next);
      onToast(tr('Repository-Allowlist gespeichert.', 'Repository allowlist saved.'), false);
      triggerRefresh();
    } catch (error) {
      if (generation.current === currentGeneration) showError(error);
    } finally {
      if (generation.current === currentGeneration) setBusy(false);
    }
  };

  const reload = async () => {
    if (!activeRepo || busy) return;
    const repoPath = activeRepo;
    const currentGeneration = generation.current;
    setBusy(true);
    try {
      const result = await repositorySecretScanAllowlistClient.get(repoPath);
      if (generation.current !== currentGeneration) return;
      if (!result.success) throw new Error(result.error);
      // Adopt the external base without losing the user's draft. They can
      // review it and explicitly save again against this newly loaded version.
      const next = { text: dirty ? draftRef.current!.text : result.data.text, savedText: result.data.text, version: result.data.version };
      drafts.set(repoPath, next);
      setDraft(next);
      setLoaded(true);
    } catch (error) {
      if (generation.current === currentGeneration) showError(error);
    } finally {
      if (generation.current === currentGeneration) setBusy(false);
    }
  };

  if (!activeRepo) return <div className="repository-security-empty">{tr('Öffne zuerst ein lokales Repository.', 'Open a local repository first.')}</div>;
  return (
    <section className="repository-security" aria-label={tr('Secret-Scan-Allowlist', 'Secret-scan allowlist')}>
      <div className="repository-security-toolbar">
        <ShieldCheck size={16} aria-hidden="true" />
        <div className="repository-security-location">
          <strong>{activeRepo.split(/[\\/]/).pop()}</strong>
          <code>{SECRET_SCAN_ALLOWLIST_PATH}</code>
        </div>
        <button className="staging-tool-btn repository-security-action" onClick={() => void reload()} disabled={busy}>
          <RefreshCw size={14} />
          {tr('Neu laden', 'Reload')}
        </button>
        <button className="staging-commit-btn repository-security-action" onClick={() => void save()} disabled={busy || !draft}>
          <Save size={14} />
          {tr('Speichern', 'Save')}
        </button>
      </div>
      <p className="repository-security-description">
        {tr(
          'Gespeicherte Ausnahmen gelten sofort für dieses Repository. Committe die Datei, um sie mit deinem Team zu teilen.',
          'Saved exceptions apply immediately to this repository. Commit the file to share them with your team.',
        )}
      </p>
      <label className="repository-security-editor-label" htmlFor="repository-secret-scan-allowlist">
        {tr('Regeln', 'Rules')}
        {dirty && <span>{tr('Ungespeicherter Entwurf', 'Unsaved draft')}</span>}
      </label>
      <textarea
        id="repository-secret-scan-allowlist"
        className="repository-security-editor"
        value={draft?.text ?? ''}
        spellCheck={false}
        disabled={!loaded || !draft}
        placeholder={'# Shared exceptions\npath:docs/example.env\nregex:DUMMY_[A-Z]+'}
        onChange={(event) => {
          if (!draft) return;
          const next = { ...draft, text: event.target.value };
          drafts.set(activeRepo, next);
          setDraft(next);
        }}
      />
      <div className="repository-security-help">
        <span>{tr('Eine Regel pro Zeile; leere Zeilen und # Kommentare werden ignoriert.', 'One rule per line; empty lines and # comments are ignored.')}</span>
        <dl>
          <dt>path:docs/example.env</dt>
          <dd>{tr('Pfad enthält diesen Text.', 'Path contains this text.')}</dd>
          <dt>regex:DUMMY_[A-Z]+</dt>
          <dd>{tr('Regulärer Ausdruck für Pfad oder Inhalt.', 'Regular expression for path or content.')}</dd>
          <dt>dummy-example</dt>
          <dd>{tr('Text in Pfad, Inhalt oder Regel-ID.', 'Text in path, content or rule ID.')}</dd>
        </dl>
      </div>
    </section>
  );
}
