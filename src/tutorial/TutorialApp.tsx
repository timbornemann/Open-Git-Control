import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import App from '@/App';
import { useGitStore, useSettingsContext, useUIContext, useRepositoryContext } from '@/contexts/AppStateContext';
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
import { useTutorialAutoAdvance } from './useTutorialAutoAdvance';
import { useTutorialViewCompletion } from './useTutorialViewCompletion';
import { useTutorialKeyboardNavigation } from './useTutorialKeyboardNavigation';
import { useTutorialFocusNavigation } from './useTutorialFocusNavigation';
import { prepareTutorialUi } from './prepareTutorialUi';
import { prepareTutorialCache } from './prepareTutorialCache';
import { useTutorialPreparation } from './useTutorialPreparation';
import { useTutorialCompletion } from './useTutorialCompletion';
import { useTutorialStaging } from './useTutorialStaging';
import { ChapterChooser } from './TutorialLessonChooser';
import { useTutorialOverlayBounds } from './useTutorialOverlayBounds';
import { TutorialDirectoryPicker } from './TutorialDirectoryPicker';
import './tutorial.css';

type Demo = ReturnType<typeof createDemoApi>;
type Checkpoint = { chapterIndex: number; stepIndex: number; demo: Demo; key: number };

export function TutorialApp({ context, initial }: { context: TutorialLaunchContext; initial: Demo }) {
  useTutorialOverlayBounds();
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
  useTutorialFocusNavigation(!choosing && !finished && !error && !loading);
  const transition = useRef(false);
  const advancing = useRef(false);
  const acknowledgedSteps = useRef(new Map<string, Set<string>>());
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const tr = (de: string, en: string) => (context.language === 'de' ? de : en);
  const enter = async (chapterIndex: number, stepIndex = 0, forward = false) => {
    if (transition.current) return;
    const target = TUTORIAL_CHAPTERS[chapterIndex].steps[stepIndex];
    if (forward && chapterIndex === checkpoint.chapterIndex && stepIndex === checkpoint.stepIndex + 1 && target.continue) {
      setCheckpoint((current) => ({ ...current, stepIndex }));
      return;
    }
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
      prepareTutorialUi(target, context.language);
      const demo = createDemoApi(
        { ...context, progress: { ...context.progress, completedChapters: completed } },
        TUTORIAL_CHAPTERS[chapterIndex].steps[stepIndex],
      );
      setIsolatedElectronApi(demo.api);
      prepareTutorialCache(demo.repo);
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
    if (advancing.current || transition.current) return;
    advancing.current = true;
    try {
      const acknowledged = acknowledgedSteps.current.get(chapter.id) || new Set<string>();
      if (!skipped) acknowledged.add(chapter.steps[checkpoint.stepIndex].id);
      acknowledgedSteps.current.set(chapter.id, acknowledged);
      if (checkpoint.stepIndex < chapter.steps.length - 1) {
        await enter(checkpoint.chapterIndex, checkpoint.stepIndex + 1, !skipped);
        return;
      }
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
    } finally {
      advancing.current = false;
    }
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
      <div
        className="tutorial-workspace"
        data-overlay-boundary
        data-tutorial-chapter={chapter.id}
        data-graph-metadata={/ \.commit-(hash|author|date|refs|stats)$/.test(chapter.steps[checkpoint.stepIndex].target) || undefined}
        aria-busy={loading}
      >
        <TutorialDirectoryPicker sessionKey={checkpoint.key} />
        {loading ? (
          <p role="status" className="tutorial-loading">
            {tr('Übung wird vorbereitet …', 'Preparing the exercise …')}
          </p>
        ) : (
          <App key={checkpoint.key}>
            <TutorialCoach
              language={context.language}
              step={chapter.steps[checkpoint.stepIndex]}
              chapterTitle={tutorialText(chapter.title, context.language)}
              index={checkpoint.stepIndex}
              total={chapter.steps.length}
              demo={checkpoint.demo}
              autoAdvanceEnabled={!choosing && !finished && !error}
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
          currentChapter={chapter.id}
          onSelect={(index) => void enter(index)}
          onDismiss={() => setChoosing(false)}
        />
      )}
    </div>
  );
}

function TutorialCoach({
  language,
  step,
  chapterTitle,
  index,
  total,
  demo,
  autoAdvanceEnabled,
  onNext,
  onSkip,
  onBack,
  onRetry,
  onChoose,
}: {
  language: 'de' | 'en';
  step: TutorialStep;
  chapterTitle: string;
  index: number;
  total: number;
  demo: Demo;
  autoAdvanceEnabled: boolean;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
  onRetry: () => void;
  onChoose: () => void;
}) {
  const { tr } = useI18n();
  const ui = useUIContext();
  const settings = useSettingsContext();
  const { activeRepo } = useRepositoryContext();
  useTutorialStaging(step, activeRepo);
  const selectedCommit = useGitStore((state) => state.selectedCommit);
  const revision = useSyncExternalStore(demo.repo.subscribe, () => demo.repo.revision);
  const analyticsChanged = useAnalyticsWorkspace((state) => Object.keys(state.filters).length > 0);
  const prepared = useTutorialPreparation(step, language);
  const { rect, workspace, missing } = useTutorialTarget(step.target, prepared);
  const heading = useRef<HTMLHeadingElement>(null);
  const inspect = useTutorialViewCompletion(step.action);
  const completedControl = useTutorialCompletion(step, language, prepared, demo.repo);
  useEffect(() => {
    if (ui.activeTab !== step.area) ui.setActiveTab(step.area);
    if (step.settingsTab) settings.onSelectSettingsTab(step.settingsTab);
    if (step.openView === 'runConfig') ui.onOpenRunConfig();
    if (step.openView === 'remoteConfig') ui.onOpenRemoteConfig();
    if (step.openView === 'secretScanAllowlist') ui.onOpenSecretScanAllowlist();
    if (step.openView === 'repositoryPublication') ui.onOpenRepositoryPublication?.();
    heading.current?.focus();
    void window.tutorialHost!.ready();
    // One entry action per checkpoint, never push the user back after navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);
  const actionDone =
    !step.action ||
    (step.action.startsWith('navigate:')
      ? ui.activeTab === step.action.slice(9)
      : step.action === 'inspect:commit'
        ? Boolean(selectedCommit)
        : step.action.startsWith('inspect:') || step.action === 'diff-closed'
          ? inspect
          : step.action === 'analytics-filtered'
            ? analyticsChanged
            : demo.repo.events.has(step.action));
  const done = prepared && actionDone && (!step.completion || completedControl);
  const interactive = Boolean(step.action || step.completion);
  useTutorialAutoAdvance(step.id, done, interactive && autoAdvanceEnabled, onNext);
  useTutorialKeyboardNavigation({ enabled: autoAdvanceEnabled, canGoBack: index > 0, canGoNext: done, onBack, onNext });
  const controls = document.getElementById('tutorial-controls');
  useEffect(() => {
    if (controls) heading.current?.focus();
  }, [controls, step.id]);
  return (
    <>
      {rect && workspace && <TutorialSpotlight target={rect} workspace={workspace} />}
      {controls &&
        createPortal(
          <section
            className="tutorial-coach"
            aria-labelledby="tutorial-step-title"
            aria-busy={!prepared}
            data-step={step.id}
            data-target={step.target}
            data-revision={revision}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
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
                ) : interactive ? (
                  done ? (
                    <>
                      <CheckCircle2 size={14} aria-hidden="true" />
                      {autoAdvanceEnabled
                        ? tr('Geschafft! Es geht gleich automatisch weiter.', 'Done! Continuing automatically in a moment.')
                        : tr('Geschafft! Du kannst weitergehen.', 'Done! You can continue.')}
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
                <button
                  type="button"
                  className="tutorial-button"
                  disabled={index === 0}
                  onClick={onBack}
                  aria-keyshortcuts="ArrowLeft"
                  title={tr('Zurück mit ←', 'Go back with ←')}
                >
                  <ChevronLeft size={14} aria-hidden="true" />
                  {tr('Zurück', 'Back')}
                </button>
                <button
                  type="button"
                  className="tutorial-button primary"
                  disabled={!done}
                  onClick={onNext}
                  aria-keyshortcuts="ArrowRight"
                  title={tr('Weiter mit →', 'Continue with →')}
                >
                  {index === total - 1 ? tr('Kapitel abschließen', 'Complete chapter') : tr('Weiter', 'Next')}
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
              <span className="tutorial-keyboard-hint">{tr('← Zurück · Weiter →', '← Back · Next →')}</span>
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
