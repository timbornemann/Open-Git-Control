import { useId } from 'react';
import { ArrowUpRight, BookOpen, CheckCircle2, ChevronDown, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import type { TutorialChapter } from '@/shared/tutorial/types';
import { tutorialText } from '@/shared/tutorial/types';
import { TUTORIAL_QUESTION_STEPS } from '@/shared/tutorial/catalogSteps';

type Props = {
  chapter: TutorialChapter;
  completed: boolean;
  expanded: boolean;
  disabled: boolean;
  onToggle: () => void;
  onStart: (chapterId: string, stepId?: string) => void;
};

export function TutorialLessonRow({ chapter, completed, expanded, disabled, onToggle, onStart }: Props) {
  const { language, tr } = useI18n();
  const id = useId();
  const Status = completed ? CheckCircle2 : BookOpen;
  return (
    <article className={`tutorial-lesson${expanded ? ' tutorial-lesson--expanded' : ''}`} data-chapter={chapter.id} aria-labelledby={`${id}-title`}>
      <div className="tutorial-lesson-heading">
        <button type="button" className="tutorial-lesson-toggle" aria-expanded={expanded} aria-controls={`${id}-details`} onClick={onToggle}>
          <Status size={16} aria-hidden="true" className={completed ? 'tutorial-lesson-completed-icon' : undefined} />
          <span className="tutorial-lesson-title">
            <strong id={`${id}-title`}>{tutorialText(chapter.title, language)}</strong>
            <span className="tutorial-lesson-meta">
              <span>{tr(`${chapter.steps.length} Schritte`, `${chapter.steps.length} steps`)}</span>
              {completed && <span className="tutorial-lesson-completed">{tr('Abgeschlossen', 'Completed')}</span>}
            </span>
          </span>
          <ChevronDown size={14} aria-hidden="true" className="tutorial-lesson-chevron" />
        </button>
        <Button
          size="xs"
          variant="ghost"
          disabled={disabled}
          icon={completed ? <RotateCcw size={13} /> : <Play size={13} />}
          onClick={() => onStart(chapter.id)}
          aria-label={tr(
            `${completed ? 'Erneut üben' : 'Lektion starten'}: ${chapter.title[0]}`,
            `${completed ? 'Practice again' : 'Start lesson'}: ${chapter.title[1]}`,
          )}
        >
          {completed ? tr('Erneut üben', 'Practice again') : tr('Starten', 'Start')}
        </Button>
      </div>
      <div id={`${id}-details`} className="tutorial-lesson-details" hidden={!expanded} aria-labelledby={`${id}-title`}>
        {expanded && (
          <>
            <p>{tutorialText(chapter.description, language)}</p>
            <button
              type="button"
              className="tutorial-lesson-question"
              disabled={disabled}
              onClick={() => onStart(chapter.id, TUTORIAL_QUESTION_STEPS[chapter.id])}
            >
              <ArrowUpRight size={14} aria-hidden="true" />
              {tutorialText(chapter.question, language)}
            </button>
            <div className="tutorial-lesson-steps">
              <h5>{tr('Einzelnen Schritt starten', 'Start an individual step')}</h5>
              <ol>
                {chapter.steps.map((step, index) => (
                  <li key={step.id}>
                    <button type="button" disabled={disabled} onClick={() => onStart(chapter.id, step.id)}>
                      <span className="tutorial-lesson-step-number" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span>{tutorialText(step.title, language)}</span>
                      <Play size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
