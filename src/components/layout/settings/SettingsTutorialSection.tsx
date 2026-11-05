import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { TUTORIAL_QUESTION_STEPS } from '@/shared/tutorial/catalogSteps';
import { TUTORIAL_SECTIONS, tutorialSection, tutorialSearchText } from '@/shared/tutorial/curriculum';
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
  const chapters = TUTORIAL_CHAPTERS.filter((chapter) => terms.every((term) => tutorialSearchText(chapter).includes(term)));
  return (
    <section aria-labelledby="settings-tutorial-title" data-tutorial="help">
      <div className="tutorial-help-intro">
        <h3 id="settings-tutorial-title" tabIndex={-1}>
          {tr('Lerne die App in deinem Tempo kennen', 'Explore the app at your own pace')}
        </h3>
        <p className="tutorial-entry-muted">
          {tr(
            'Beginne mit der Übersicht und wähle anschließend Detaillektionen nach Bereich. Du kannst auch direkt zu einem einzelnen Schritt springen. Neue Einstiege verwenden frische Beispieldaten; innerhalb einer Lektion bleiben deine Übungseingaben erhalten.',
            'Begin with the overview, then choose detailed lessons by area. You can also jump to an individual step. Each new entry uses fresh sample data; your practice inputs are retained as you progress through a lesson.',
          )}
        </p>
        <label>
          <span className="tutorial-entry-muted">{tr('Lektionen, Schritte und Fragen durchsuchen', 'Search lessons, steps and questions')}</span>
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
      {TUTORIAL_SECTIONS.map((section) => {
        const lessons = chapters.filter((chapter) => tutorialSection(chapter) === section.id);
        return (
          lessons.length > 0 && (
            <section className="tutorial-help-section" key={section.id}>
              <h3>{tutorialText(section.title, language)}</h3>
              <div className="tutorial-help-grid">
                {lessons.map((chapter) => (
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
                    <details className="tutorial-help-steps" open={terms.length > 0}>
                      <summary>
                        {chapter.steps.length} {tr('Schritte ansehen oder einzeln starten', 'steps: view or start individually')}
                      </summary>
                      <ol>
                        {chapter.steps.map((step) => (
                          <li key={step.id}>
                            <button
                              type="button"
                              className="tutorial-help-question"
                              disabled={busy || !tutorialAvailable()}
                              onClick={() => start(chapter.id, step.id)}
                            >
                              {tutorialText(step.title, language)}
                            </button>
                          </li>
                        ))}
                      </ol>
                    </details>
                    <button
                      type="button"
                      className="tutorial-help-question"
                      disabled={busy || !tutorialAvailable()}
                      onClick={() => start(chapter.id, TUTORIAL_QUESTION_STEPS[chapter.id])}
                    >
                      {tutorialText(chapter.question, language)}
                    </button>
                    <button type="button" className="tutorial-button" disabled={busy || !tutorialAvailable()} onClick={() => start(chapter.id)}>
                      {completed.includes(chapter.id) ? tr('Erneut üben', 'Practice again') : tr('Lektion starten', 'Start lesson')}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )
        );
      })}
      {!chapters.length && <p>{tr('Keine passende Hilfe gefunden. Versuche einen anderen Begriff.', 'No matching help. Try a different search term.')}</p>}
    </section>
  );
}
