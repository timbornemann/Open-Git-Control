import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { TUTORIAL_QUESTION_STEPS } from '@/shared/tutorial/catalogSteps';
import { tutorialText } from '@/shared/tutorial/types';
import { launchTutorial, tutorialProgress, tutorialAvailable } from '@/tutorial/entryApi';
import { getElectronApi } from '@/services/electronApi';
import '@/components/onboarding/tutorialEntry.css';

export function SettingsTutorialSection() {
  const { language, tr } = useI18n();
  const [completed, setCompleted] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void tutorialProgress()
        .then((progress) => {
          if (active) setCompleted(progress.completedChapters);
        })
        .catch(() => undefined);
    refresh();
    const unsubscribe = getElectronApi()?.app?.onTutorialClosed?.(refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      unsubscribe?.();
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const start = (chapterId: string, stepId?: string) => {
    setBusy(true);
    setError('');
    void launchTutorial({ chapterId, ...(stepId ? { stepId } : {}) })
      .catch(() =>
        setError(tr('Die Einführung konnte nicht geöffnet werden. Bitte versuche es erneut.', 'The introduction could not be opened. Please try again.')),
      )
      .finally(() => setBusy(false));
  };
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const chapters = TUTORIAL_CHAPTERS.filter((chapter) =>
    terms.every((term) =>
      `${chapter.title.join(' ')} ${chapter.description.join(' ')} ${chapter.question.join(' ')} ${chapter.keywords}`.toLocaleLowerCase().includes(term),
    ),
  );
  return (
    <section aria-labelledby="settings-tutorial-title" data-tutorial="help">
      <div className="tutorial-help-intro">
        <h3 id="settings-tutorial-title" tabIndex={-1}>
          {tr('Lerne die App in deinem Tempo kennen', 'Explore the app at your own pace')}
        </h3>
        <p className="tutorial-entry-muted">
          {tr(
            'Starte die Grundtour oder springe direkt zu deiner Frage. Jede Übung beginnt mit frischen Beispieldaten. Deine Projekte und Einstellungen bleiben erhalten.',
            'Start the basic tour or jump straight to your question. Every exercise starts with fresh sample data. Your projects and settings are preserved.',
          )}
        </p>
        <label>
          <span className="tutorial-entry-muted">{tr('Kapitel und Fragen durchsuchen', 'Search chapters and questions')}</span>
          <input className="ui-field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        {!tutorialAvailable() && (
          <p className="tutorial-entry-muted">
            {tr('Die interaktive Einführung ist in der Desktop-App verfügbar.', 'The interactive introduction is available in the desktop app.')}
          </p>
        )}
        {error && (
          <p role="alert" className="tutorial-entry-error">
            {error}
          </p>
        )}
      </div>
      <div className="tutorial-help-grid">
        {chapters.map((chapter) => (
          <article className="tutorial-help-card" key={chapter.id}>
            <BookOpen size={20} aria-hidden="true" />
            <h3>{tutorialText(chapter.title, language)}</h3>
            {completed.includes(chapter.id) && (
              <span className="tutorial-help-completed">
                <CheckCircle2 size={14} aria-hidden="true" />
                {tr('Abgeschlossen', 'Completed')}
              </span>
            )}
            <p>{tutorialText(chapter.description, language)}</p>
            <button
              type="button"
              className="tutorial-help-question"
              disabled={busy || !tutorialAvailable()}
              onClick={() => start(chapter.id, TUTORIAL_QUESTION_STEPS[chapter.id])}
            >
              {tutorialText(chapter.question, language)}
            </button>
            <button type="button" className="tutorial-button" disabled={busy || !tutorialAvailable()} onClick={() => start(chapter.id)}>
              {completed.includes(chapter.id) ? tr('Erneut üben', 'Practice again') : tr('Kapitel starten', 'Start chapter')}
            </button>
          </article>
        ))}
      </div>
      {!chapters.length && <p>{tr('Keine passende Hilfe gefunden. Versuche einen anderen Begriff.', 'No matching help. Try a different search term.')}</p>}
    </section>
  );
}
