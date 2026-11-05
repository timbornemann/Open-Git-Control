import { useEffect, useRef, useState } from 'react';
import { BookOpen, ArrowRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import { getElectronApi } from '@/services/electronApi';
import { launchTutorial, tutorialAvailable, tutorialProgress } from '@/tutorial/entryApi';
import './tutorialEntry.css';

export function useTutorialWelcome() {
  const [pending, setPending] = useState(tutorialAvailable);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true;
    void tutorialProgress()
      .then((progress) => {
        if (active) {
          setVisible(!progress.welcomeSeen);
          setPending(false);
        }
      })
      .catch(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return { visible, pending, dismiss: () => setVisible(false) };
}

export function TutorialWelcome({ onClose }: { onClose: () => void }) {
  const { tr } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    // Record only after the welcome actually mounted, including when the app
    // closes without choosing either option. StrictMode retries are idempotent.
    void getElectronApi()
      ?.app?.acknowledgeTutorialWelcome?.()
      .catch(() => undefined);
    return () => previouslyFocused?.focus();
  }, []);
  return (
    <div
      className="tutorial-welcome-backdrop"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'Tab') {
          const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])];
          if (!buttons.length) return;
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault();
          buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
        }
      }}
    >
      <div
        ref={root}
        className="tutorial-welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-welcome-title"
        aria-describedby="tutorial-welcome-description"
      >
        <div className="tutorial-welcome-icon">
          <BookOpen size={32} aria-hidden="true" />
        </div>
        <p className="tutorial-eyebrow">Open-Git-Control</p>
        <h1 id="tutorial-welcome-title">{tr('Dein Projekt. Dein nächster Schritt.', 'Your project. Your next step.')}</h1>
        <p id="tutorial-welcome-description">
          {tr(
            'Starte mit einer Übersicht durch alle Bereiche der linken Navigation. Danach entscheidest du, ob du mit ausführlichen Übungen weiterlernen oder direkt zur App wechseln möchtest.',
            'Start with an overview of every area in the activity bar. Afterwards, choose detailed practice lessons or return straight to the app.',
          )}
        </p>
        <p className="tutorial-entry-muted">
          {tr(
            'Mit Beispieldaten, ohne Anmeldung. Deine eigenen Projekte bleiben unberührt. Alle Kapitel findest du später unter Einstellungen → Einführung & Hilfe.',
            'With sample data and no sign-in. Your own projects stay safe. Find every chapter later in Settings → Introduction & help.',
          )}
        </p>
        {error && (
          <p role="alert" className="tutorial-entry-error">
            {error}
          </p>
        )}
        <div className="tutorial-entry-actions">
          <button
            type="button"
            className="tutorial-button primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError('');
              void launchTutorial({ chapterId: 'basics' })
                .then(onClose)
                .catch(() =>
                  setError(
                    tr('Die Einführung konnte nicht geöffnet werden. Bitte versuche es erneut.', 'The introduction could not be opened. Please try again.'),
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {tr('Einführung starten', 'Start introduction')}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="tutorial-button" onClick={onClose}>
            {tr('Überspringen', 'Skip')}
          </button>
        </div>
      </div>
    </div>
  );
}
