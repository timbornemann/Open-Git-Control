import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import App from '@/App';
import { useGitStore, useSettingsContext, useUIContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import { TUTORIAL_CHAPTERS, resolveTutorialRequest } from '@/shared/tutorial/catalog';
import { tutorialText, type TutorialLaunchContext, type TutorialLaunchRequest, type TutorialStep } from '@/shared/tutorial/types';
import { setIsolatedElectronApi } from '@/services/electronApi';
import { queryClient } from '@/data/queryClient';
import { useAnalyticsWorkspace } from '@/components/repository-analytics/analyticsWorkspaceState';
import { createDemoApi } from './demoApi';
import { resetTutorialUi } from './resetTutorialUi';
import { TutorialSpotlight } from './TutorialSpotlight';
import { useTutorialTarget } from './useTutorialTarget';
import './tutorial.css';

type Demo = ReturnType<typeof createDemoApi>;
type Checkpoint = { chapterIndex: number; stepIndex: number; demo: Demo; key: number };

export function TutorialApp({ context, initial }: { context: TutorialLaunchContext; initial: Demo }) {
  const initialChapter = TUTORIAL_CHAPTERS.findIndex((chapter) => chapter.id === context.request.chapterId);
  const initialStep = Math.max(
    0,
    TUTORIAL_CHAPTERS[initialChapter].steps.findIndex((step) => step.id === context.request.stepId),
  );
  const [checkpoint, setCheckpoint] = useState<Checkpoint>({ chapterIndex: initialChapter, stepIndex: initialStep, demo: initial, key: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(context.progress.completedChapters);
  const [choosing, setChoosing] = useState(false);
  const [finished, setFinished] = useState(false);
  const transition = useRef(false);
  const acknowledgedSteps = useRef(new Map<string, Set<string>>());
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const tr = (de: string, en: string) => (context.language === 'de' ? de : en);
  const enter = async (chapterIndex: number, stepIndex = 0) => {
    if (transition.current) return;
    transition.current = true;
    setLoading(true);
    setFinished(false);
    setChoosing(false);
    setError('');
    try {
      await queryClient.cancelQueries();
      // These stores and both storage areas belong to this transient renderer.
      // The normal application's JS realm and partition are never touched.
      resetTutorialUi();
      const demo = createDemoApi(
        { ...context, progress: { ...context.progress, completedChapters: completed } },
        TUTORIAL_CHAPTERS[chapterIndex].steps[stepIndex],
      );
      setIsolatedElectronApi(demo.api);
      if (mounted.current) setCheckpoint((current) => ({ chapterIndex, stepIndex, demo, key: current.key + 1 }));
    } catch {
      setError(tr('Der Schritt konnte nicht geladen werden. Bitte wiederhole ihn.', 'The step could not be loaded. Please retry.'));
    } finally {
      transition.current = false;
      if (mounted.current) setLoading(false);
    }
  };
  useEffect(() => {
    const launch = (event: Event) => {
      try {
        const request = resolveTutorialRequest((event as CustomEvent<TutorialLaunchRequest>).detail);
        const chapterIndex = TUTORIAL_CHAPTERS.findIndex((chapter) => chapter.id === request.chapterId);
        const stepIndex = Math.max(
          0,
          TUTORIAL_CHAPTERS[chapterIndex].steps.findIndex((step) => step.id === request.stepId),
        );
        void enter(chapterIndex, stepIndex);
      } catch {
        /* Unknown requests cannot escape the simulated environment. */
      }
    };
    window.addEventListener('tutorial:launch', launch);
    return () => window.removeEventListener('tutorial:launch', launch);
  });
  const chapter = TUTORIAL_CHAPTERS[checkpoint.chapterIndex];
  const next = async (skipped = false) => {
    const acknowledged = acknowledgedSteps.current.get(chapter.id) || new Set<string>();
    if (!skipped) acknowledged.add(chapter.steps[checkpoint.stepIndex].id);
    acknowledgedSteps.current.set(chapter.id, acknowledged);
    if (checkpoint.stepIndex < chapter.steps.length - 1) return enter(checkpoint.chapterIndex, checkpoint.stepIndex + 1);
    if (!skipped && acknowledged.size === chapter.steps.length) {
      try {
        const progress = await window.tutorialHost!.completeChapter(chapter.id);
        setCompleted(progress.completedChapters);
      } catch {
        setError(tr('Der Abschluss konnte nicht gespeichert werden. Du kannst es erneut versuchen.', 'Completion could not be saved. You can try again.'));
        return;
      }
    }
    setFinished(true);
    setChoosing(true);
  };
  return (
    <div className="tutorial-session">
      <header className="tutorial-banner">
        <span>
          <BookOpen size={16} aria-hidden="true" />
          {tr('Übungsmodus – Beispieldaten', 'Practice mode – sample data')}
        </span>
        <button type="button" className="tutorial-button" onClick={() => void window.tutorialHost!.close()}>
          <X size={14} aria-hidden="true" />
          {tr('Einführung beenden', 'End introduction')}
        </button>
      </header>
      <div className="tutorial-workspace" aria-busy={loading}>
        {loading ? (
          <p role="status" className="tutorial-loading">
            {tr('Übung wird vorbereitet …', 'Preparing the exercise …')}
          </p>
        ) : (
          <App key={checkpoint.key}>
            <TutorialCoach
              step={chapter.steps[checkpoint.stepIndex]}
              chapterTitle={tutorialText(chapter.title, context.language)}
              index={checkpoint.stepIndex}
              total={chapter.steps.length}
              demo={checkpoint.demo}
              onNext={() => void next()}
              onSkip={() => void next(true)}
              onBack={() => void enter(checkpoint.chapterIndex, checkpoint.stepIndex - 1)}
              onRetry={() => void enter(checkpoint.chapterIndex, checkpoint.stepIndex)}
              onChoose={() => setChoosing(true)}
            />
          </App>
        )}
      </div>
      <div id="tutorial-controls" />
      {error && (
        <p role="alert" className="tutorial-failure">
          {error}
          <button type="button" onClick={() => void enter(checkpoint.chapterIndex, checkpoint.stepIndex)}>
            {tr('Wiederholen', 'Retry')}
          </button>
        </p>
      )}
      {choosing && (
        <ChapterChooser
          language={context.language}
          completed={completed}
          finished={finished}
          onSelect={(index) => void enter(index)}
          onDismiss={() => setChoosing(false)}
        />
      )}
    </div>
  );
}

function TutorialCoach({
  step,
  chapterTitle,
  index,
  total,
  demo,
  onNext,
  onSkip,
  onBack,
  onRetry,
  onChoose,
}: {
  step: TutorialStep;
  chapterTitle: string;
  index: number;
  total: number;
  demo: Demo;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
  onRetry: () => void;
  onChoose: () => void;
}) {
  const { tr, language } = useI18n();
  const ui = useUIContext();
  const settings = useSettingsContext();
  const selectedCommit = useGitStore((state) => state.selectedCommit);
  const revision = useSyncExternalStore(demo.repo.subscribe, () => demo.repo.revision);
  const analyticsChanged = useAnalyticsWorkspace((state) => Object.keys(state.filters).length > 0);
  const { rect, workspace, missing } = useTutorialTarget(step.target);
  const heading = useRef<HTMLHeadingElement>(null);
  const [inspect, setInspect] = useState(false);
  useEffect(() => {
    ui.setActiveTab(step.area);
    if (step.settingsTab) settings.onSelectSettingsTab(step.settingsTab);
    if (step.openView === 'runConfig') ui.onOpenRunConfig();
    heading.current?.focus();
    void window.tutorialHost!.ready();
    // One entry action per checkpoint, never push the user back after navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);
  useEffect(() => {
    const selector = step.openView === 'recovery' ? '[data-tutorial="open-recovery"]' : step.openView === 'files' ? '[data-tutorial="open-files"]' : null;
    if (!selector) return;
    let opened = false;
    const open = () => {
      const button = document.querySelector<HTMLButtonElement>(selector);
      if (!opened && button && !button.disabled) {
        opened = true;
        button.click();
      }
    };
    const observer = new MutationObserver(open);
    observer.observe(document.querySelector('.tutorial-workspace')!, { childList: true, subtree: true });
    open();
    return () => observer.disconnect();
  }, [step.openView]);
  useEffect(() => {
    if (step.action !== 'inspect:diff' && step.action !== 'inspect:recovery') return;
    const check = () =>
      setInspect(
        Boolean(
          document.querySelector(
            `[data-tutorial-route="${step.action === 'inspect:recovery' ? 'recovery' : 'diff'}"], [data-tutorial-route="file"]${step.action === 'inspect:diff' ? ', .working-tree-inspector.has-selection' : ''}`,
          ),
        ),
      );
    const observer = new MutationObserver(check);
    observer.observe(document.querySelector('.tutorial-workspace')!, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tutorial-route'],
    });
    check();
    return () => observer.disconnect();
  }, [step.action]);
  const done =
    !step.action ||
    (step.action.startsWith('navigate:')
      ? ui.activeTab === step.action.slice(9)
      : step.action === 'inspect:commit'
        ? Boolean(selectedCommit)
        : step.action.startsWith('inspect:')
          ? inspect
          : step.action === 'analytics-filtered'
            ? analyticsChanged
            : demo.repo.events.has(step.action));
  const controls = document.getElementById('tutorial-controls');
  useEffect(() => {
    if (controls) heading.current?.focus();
  }, [controls, step.id]);
  return (
    <>
      {rect && workspace && <TutorialSpotlight target={rect} workspace={workspace} />}
      {controls &&
        createPortal(
          <section className="tutorial-coach" aria-labelledby="tutorial-step-title" data-step={step.id} data-revision={revision}>
            <div className="tutorial-coach-copy">
              <p className="tutorial-coach-progress">
                {chapterTitle} · {index + 1} / {total}
              </p>
              <h2 ref={heading} tabIndex={-1} id="tutorial-step-title">
                {tutorialText(step.title, language)}
              </h2>
              <p id="tutorial-step-description">{tutorialText(step.description, language)}</p>
              <span role="status" className={done ? 'tutorial-status completed' : 'tutorial-status'}>
                {missing ? (
                  tr('Das Bedienelement ist gerade nicht sichtbar.', 'The control is currently not visible.')
                ) : step.action ? (
                  done ? (
                    <>
                      <CheckCircle2 size={14} aria-hidden="true" />
                      {tr('Geschafft! Du kannst weitergehen.', 'Done! You can continue.')}
                    </>
                  ) : (
                    tr('Probiere die beschriebene Aktion aus.', 'Try the action described above.')
                  )
                ) : (
                  tr('Lies die Erklärung und gehe dann weiter.', 'Read the explanation, then continue.')
                )}
              </span>
            </div>
            <div className="tutorial-coach-actions">
              <div className="tutorial-action-row">
                <button type="button" className="tutorial-button" disabled={index === 0} onClick={onBack}>
                  <ChevronLeft size={14} aria-hidden="true" />
                  {tr('Zurück', 'Back')}
                </button>
                <button type="button" className="tutorial-button primary" disabled={!done} onClick={onNext}>
                  {index === total - 1 ? tr('Kapitel abschließen', 'Complete chapter') : tr('Weiter', 'Next')}
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="tutorial-action-row">
                <button type="button" className="tutorial-link" onClick={onSkip}>
                  {tr('Schritt überspringen', 'Skip step')}
                </button>
                <button type="button" className="tutorial-link" onClick={onChoose}>
                  {tr('Kapitel wählen', 'Choose chapter')}
                </button>
              </div>
              {missing && (
                <button type="button" className="tutorial-button" onClick={onRetry}>
                  <RotateCcw size={14} aria-hidden="true" />
                  {tr('Schritt wiederholen', 'Retry step')}
                </button>
              )}
            </div>
          </section>,
          controls,
        )}
    </>
  );
}

function ChapterChooser({
  language,
  completed,
  finished,
  onSelect,
  onDismiss,
}: {
  language: 'de' | 'en';
  completed: string[];
  finished: boolean;
  onSelect: (index: number) => void;
  onDismiss: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const tr = (de: string, en: string) => (language === 'de' ? de : en);
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
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
              {finished
                ? tr('Kapitel beendet. Was möchtest du als Nächstes lernen?', 'Chapter finished. What would you like to learn next?')
                : tr('Wähle dein Thema', 'Choose your topic')}
            </h2>
          </div>
          <button type="button" className="tutorial-button" aria-label={tr('Kapitelwahl schließen', 'Close chapter selection')} onClick={onDismiss}>
            <X size={16} />
          </button>
        </header>
        <div className="tutorial-chapter-list">
          {TUTORIAL_CHAPTERS.map((chapter, index) => (
            <button type="button" key={chapter.id} onClick={() => onSelect(index)}>
              <span>
                <strong>{tutorialText(chapter.title, language)}</strong>
                <small>{tutorialText(chapter.description, language)}</small>
              </span>
              {completed.includes(chapter.id) ? (
                <CheckCircle2 size={18} aria-label={tr('Abgeschlossen', 'Completed')} />
              ) : (
                <ChevronRight size={18} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
        <button type="button" className="tutorial-button" onClick={() => void window.tutorialHost!.close()}>
          {tr('Zur App zurückkehren', 'Return to the app')}
        </button>
      </div>
    </div>
  );
}
