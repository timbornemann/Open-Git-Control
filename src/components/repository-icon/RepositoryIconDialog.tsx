import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image, RefreshCw, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepositoryIcon } from './useRepositoryIcon';
import { RepositoryIconCandidate } from './RepositoryIconCandidate';
import { repoName } from '@/components/local-repositories/localRepositorySelectors';
import { repositoryIconsClient } from '@/services/repositoryIconsClient';
import { loadRepositoryIconPreview } from '@/services/repositoryIconPreview';
import { publishRepositoryIcon, refreshRepositoryIcon } from '@/data/repositoryIcons';
import type { RepositoryIconMode } from '@/shared/repositoryIcons';
import { REPOSITORY_ICON_DIALOG_EVENT } from './repositoryIconDialogEvents';
import '@/styles/repository-icons.css';

export function RepositoryIconDialogHost() {
  const [repoPath, setRepoPath] = useState<string | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const path = (event as CustomEvent<unknown>).detail;
      if (typeof path === 'string' && path) setRepoPath(path);
    };
    window.addEventListener(REPOSITORY_ICON_DIALOG_EVENT, open);
    return () => window.removeEventListener(REPOSITORY_ICON_DIALOG_EVENT, open);
  }, []);
  return repoPath ? (
    <RepositoryIconDialog key={repoPath} repoPath={repoPath} onClose={() => setRepoPath((current) => (current === repoPath ? null : current))} />
  ) : null;
}
export function RepositoryIconDialog({ repoPath, onClose }: { repoPath: string; onClose: () => void }) {
  const { tr } = useI18n();
  const state = useRepositoryIcon(repoPath);
  const [mode, setMode] = useState<RepositoryIconMode>('auto');
  const [selected, setSelected] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [limit, setLimit] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const baseVersion = useRef<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!state || baseVersion.current) return;
    baseVersion.current = state.selectionVersion;
    setMode(state.mode);
    setSelected(state.manualPath || state.thumbnail?.path || null);
  }, [state]);
  useEffect(() => {
    if (state) setLoadError(null);
  }, [state]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    active.current = true;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      active.current = false;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    let mounted = true;
    void refreshRepositoryIcon(repoPath).catch((failure) => {
      if (mounted) setLoadError(failure instanceof Error ? failure.message : String(failure));
    });
    return () => {
      mounted = false;
    };
  }, [repoPath]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : tr('Logo konnte nicht geladen werden.', 'Logo could not be loaded.'));
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      if (!baseVersion.current) throw new Error(tr('Repository wird noch geladen.', 'Repository is still loading.'));
      if (mode === 'manual') {
        if (!selected) throw new Error(tr('Wähle eine Bilddatei.', 'Choose an image file.'));
        await loadRepositoryIconPreview(repoPath, selected);
      }
      if (!active.current) return;
      const result = await repositoryIconsClient.choose(repoPath, {
        mode,
        ...(mode === 'manual' && selected ? { path: selected } : {}),
        expectedSelectionVersion: baseVersion.current,
      });
      if (!result.success) throw new Error(result.error || tr('Logo konnte nicht gespeichert werden.', 'Logo could not be saved.'));
      if (active.current) {
        publishRepositoryIcon(result.data);
        closeRef.current();
      }
    });
  const browse = () =>
    run(async () => {
      const result = await repositoryIconsClient.selectFile(repoPath);
      if (!result.success) throw new Error(result.error || tr('Bilddatei konnte nicht gewählt werden.', 'Could not choose an image.'));
      if (active.current && result.data) {
        const path = result.data;
        setExtra((previous) => [...new Set([...previous, path])]);
        setSelected(path);
        setMode('manual');
      }
    });
  const candidates = [...new Set([...(selected ? [selected] : []), ...extra, ...(state?.candidates || [])])];
  return createPortal(
    <div
      className="repository-icon-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        className="repository-icon-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="repository-icon-dialog-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) {
            event.stopPropagation();
            onClose();
          }
          if (event.key === 'Tab') {
            const controls = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || [])];
            const first = controls[0],
              last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <h2 id="repository-icon-dialog-title">{tr('Repository-Logo', 'Repository logo')}</h2>
            <strong>{repoName(repoPath)}</strong>
            <small>{repoPath}</small>
          </div>
          <button type="button" disabled={busy} aria-label={tr('Schließen', 'Close')} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <fieldset disabled={busy} className="repository-icon-modes">
          <legend>{tr('Anzeige', 'Display')}</legend>
          <label>
            <input type="radio" name="repository-icon-mode" checked={mode === 'auto'} onChange={() => setMode('auto')} />{' '}
            {tr('Automatisch auswählen', 'Choose automatically')}
          </label>
          <label>
            <input type="radio" name="repository-icon-mode" checked={mode === 'manual'} onChange={() => setMode('manual')} />{' '}
            {tr('Bilddatei auswählen', 'Choose image')}
          </label>
          <label>
            <input type="radio" name="repository-icon-mode" checked={mode === 'initials'} onChange={() => setMode('initials')} />{' '}
            {tr('Buchstaben verwenden', 'Use initials')}
          </label>
        </fieldset>
        <div className="repository-icon-dialog__actions">
          <button type="button" disabled={busy} onClick={() => void browse()}>
            <Image size={15} /> {tr('Andere Bilddatei im Repository auswählen', 'Choose another image in the repository')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await refreshRepositoryIcon(repoPath, true);
              })
            }
          >
            <RefreshCw size={15} /> {tr('Neu suchen', 'Search again')}
          </button>
        </div>
        {(error || loadError || state?.error) && (
          <p role="alert" className="repository-icon-dialog__error">
            {error || loadError || state?.error}
          </p>
        )}
        {state?.limited && (
          <p>
            {tr(
              'Die automatische Suche wurde begrenzt. Weitere Bilder kannst du über die Dateiauswahl hinzufügen.',
              'The automatic search was limited. Use the file picker to choose other images.',
            )}
          </p>
        )}
        <div className="repository-icon-candidates" aria-busy={busy || state?.status === 'scanning'}>
          {candidates.slice(0, limit).map((path) => (
            <RepositoryIconCandidate
              key={path}
              repoPath={repoPath}
              path={path}
              selected={mode === 'manual' && selected === path}
              onSelect={() => {
                if (!busy) {
                  setSelected(path);
                  setMode('manual');
                }
              }}
            />
          ))}
          {!candidates.length && (
            <p>
              {!error && !loadError && (state?.status === 'scanning' || !state)
                ? tr('Bilder werden gesucht …', 'Searching for images …')
                : tr(
                    'Kein passendes Logo gefunden. Du kannst eine Bilddatei aus dem Repository auswählen.',
                    'No matching logo found. You can choose an image from the repository.',
                  )}
            </p>
          )}
        </div>
        {candidates.length > limit && (
          <button type="button" onClick={() => setLimit((previous) => previous + 50)}>
            {tr('Weitere Bilder anzeigen', 'Show more images')}
          </button>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            {tr('Abbrechen', 'Cancel')}
          </button>
          <button type="button" className="is-primary" disabled={busy || !state} onClick={() => void save()}>
            {tr('Speichern', 'Save')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
