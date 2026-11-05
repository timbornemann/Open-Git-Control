import { useEffect, useRef } from 'react';
import { CheckCircle2, ChevronRight, X } from 'lucide-react';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { TUTORIAL_SECTIONS, tutorialSection } from '@/shared/tutorial/curriculum';
import { tutorialText } from '@/shared/tutorial/types';

export function ChapterChooser({
  language,
  completed,
  finished,
  currentChapter,
  onSelect,
  onDismiss,
}: {
  language: 'de' | 'en';
  completed: string[];
  finished: boolean;
  currentChapter: string;
  onSelect: (index: number) => void;
  onDismiss: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const tr = (de: string, en: string) => (language === 'de' ? de : en);
  const overviewDone = finished && currentChapter === 'basics';
  const nextIndex = TUTORIAL_CHAPTERS.findIndex((chapter) => chapter.id === currentChapter) + 1;
  const recommended = nextIndex < TUTORIAL_CHAPTERS.length ? nextIndex : 1;
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    (
      root.current?.querySelector<HTMLButtonElement>('[data-tutorial="continue-learning"]') || root.current?.querySelector<HTMLButtonElement>('button')
    )?.focus();
    return () => focused?.focus();
  }, []);
  return (
    <div
      className="tutorial-welcome-backdrop"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDismiss();
        if (event.key === 'Tab') {
          const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>('button')];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault();
          buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
        }
      }}
    >
      <div className="tutorial-chapter-chooser" ref={root} role="dialog" aria-modal="true" aria-labelledby="tutorial-chapters-title">
        <header>
          <div>
            <p className="tutorial-eyebrow">{tr('Dein Lernpfad', 'Your learning path')}</p>
            <h2 id="tutorial-chapters-title">
              {overviewDone
                ? tr('Übersicht abgeschlossen. Möchtest du weiterlernen?', 'Overview complete. Would you like to keep learning?')
                : finished
                  ? tr('Lektion abgeschlossen. Was kommt als Nächstes?', 'Lesson complete. What would you like to learn next?')
                  : tr('Wähle eine Lektion', 'Choose a lesson')}
            </h2>
          </div>
          <button type="button" className="tutorial-button" aria-label={tr('Kapitelwahl schließen', 'Close chapter selection')} onClick={onDismiss}>
            <X size={16} />
          </button>
        </header>
        {finished && (
          <div className="tutorial-learning-choice">
            <p>
              {overviewDone
                ? tr(
                    'Die Übersicht hat nur die Bereiche gezeigt. Die nächsten Lektionen erklären jede Handlung einzeln. Du kannst auch jetzt zur App wechseln und später hier weitermachen.',
                    'The overview only introduced the areas. The next lessons explain each action separately. You can also return to the app now and continue here later.',
                  )
                : tr(
                    'Lerne mit der nächsten Lektion weiter oder wähle unten ein anderes Thema.',
                    'Continue with the next lesson or choose another topic below.',
                  )}
            </p>
            <div className="tutorial-entry-actions">
              <button type="button" className="tutorial-button primary" data-tutorial="continue-learning" onClick={() => onSelect(recommended)}>
                {tr('Weiterlernen', 'Keep learning')}: {tutorialText(TUTORIAL_CHAPTERS[recommended].title, language)}
              </button>
              <button type="button" className="tutorial-button" data-tutorial="finish-learning" onClick={() => void window.tutorialHost!.close()}>
                {tr('Zur App – später weiterlernen', 'Return to the app – continue later')}
              </button>
            </div>
          </div>
        )}
        {TUTORIAL_SECTIONS.map((section) => {
          const lessons = TUTORIAL_CHAPTERS.filter((chapter) => tutorialSection(chapter) === section.id);
          return (
            lessons.length > 0 && (
              <section className="tutorial-lesson-section" key={section.id}>
                <h3>{tutorialText(section.title, language)}</h3>
                <div className="tutorial-chapter-list">
                  {lessons.map((chapter) => (
                    <button type="button" key={chapter.id} onClick={() => onSelect(TUTORIAL_CHAPTERS.indexOf(chapter))}>
                      <span>
                        <strong>{tutorialText(chapter.title, language)}</strong>
                        <small>{tutorialText(chapter.description, language)}</small>
                        <small>
                          {chapter.steps.length} {tr('Schritte', 'steps')}
                        </small>
                      </span>
                      {completed.includes(chapter.id) ? (
                        <CheckCircle2 size={18} aria-label={tr('Abgeschlossen', 'Completed')} />
                      ) : (
                        <ChevronRight size={18} aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )
          );
        })}
        {!finished && (
          <button type="button" className="tutorial-button" onClick={() => void window.tutorialHost!.close()}>
            {tr('Zur App zurückkehren', 'Return to the app')}
          </button>
        )}
      </div>
    </div>
  );
}
