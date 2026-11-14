import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, BookOpen, Cloud, FolderOpen, GitBranch, Layers, ListTodo, Search, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { TUTORIAL_SECTIONS, tutorialSection, tutorialSearchText } from '@/shared/tutorial/curriculum';
import { tutorialText } from '@/shared/tutorial/types';
import { launchTutorial, tutorialProgress, tutorialAvailable } from '@/tutorial/entryApi';
import { getElectronApi } from '@/services/electronApi';
import { TutorialLessonRow } from './TutorialLessonRow';
import './settingsTutorial.css';

const topicIcons = {
  overview: BookOpen,
  repo: GitBranch,
  localRepos: FolderOpen,
  planner: ListTodo,
  hosting: Cloud,
  analytics: BarChart3,
  settings: Settings2,
};
type Topic = (typeof TUTORIAL_SECTIONS)[number]['id'] | 'all';
type Props = { query?: string; onClearSearch?: () => void };
const searchableChapters = TUTORIAL_CHAPTERS.map((chapter) => ({ chapter, text: tutorialSearchText(chapter) }));

export function SettingsTutorialSection({ query = '', onClearSearch }: Props) {
  const { language, tr } = useI18n();
  const [completed, setCompleted] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);
  const [topic, setTopic] = useState<Topic>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
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
    if (starting.current || !tutorialAvailable()) return;
    starting.current = true;
    setBusy(true);
    setError('');
    void launchTutorial({ chapterId, ...(stepId ? { stepId } : {}) })
      .catch(() =>
        setError(tr('Die Einführung konnte nicht geöffnet werden. Bitte versuche es erneut.', 'The introduction could not be opened. Please try again.')),
      )
      .finally(() => {
        starting.current = false;
        setBusy(false);
      });
  };
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = useMemo(() => {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return searchableChapters.filter(({ text }) => words.every((word) => text.includes(word))).map(({ chapter }) => chapter);
  }, [query]);
  const chapters = matches.filter((chapter) => topic === 'all' || tutorialSection(chapter) === topic);
  const completedCount = TUTORIAL_CHAPTERS.filter((chapter) => completed.includes(chapter.id)).length;
  const topicLabel = (id: Topic) =>
    id === 'all'
      ? tr('Alle Lektionen', 'All lessons')
      : id === 'repo'
        ? tr('Git & Dateien', 'Git & files')
        : id === 'settings'
          ? tr('KI & Einstellungen', 'AI & settings')
          : tutorialText(TUTORIAL_SECTIONS.find((section) => section.id === id)!.title, language);
  const selectTopic = (value: Topic) => {
    setTopic(value);
    setExpanded(null);
    resultsRef.current?.scrollIntoView?.({ block: 'start' });
  };
  const available = tutorialAvailable();
  return (
    <section className="tutorial-catalog" aria-labelledby="settings-tutorial-title" data-tutorial="help">
      <header className="tutorial-catalog-intro">
        <div>
          <h3 id="settings-tutorial-title" tabIndex={-1}>
            {tr('Mit Beispieldaten üben', 'Practice with sample data')}
          </h3>
          <p>
            {tr(
              'Wähle einen Bereich oder suche nach einer Aufgabe. Jede Lektion lässt sich auch ab einem einzelnen Schritt starten.',
              'Choose a topic or search for a task. You can also start a lesson from any individual step.',
            )}
          </p>
        </div>
        <div className="tutorial-catalog-progress">
          <span>{tr(`${completedCount} von ${TUTORIAL_CHAPTERS.length} abgeschlossen`, `${completedCount} of ${TUTORIAL_CHAPTERS.length} completed`)}</span>
          <div
            role="progressbar"
            aria-label={tr('Lernfortschritt', 'Learning progress')}
            aria-valuemin={0}
            aria-valuemax={TUTORIAL_CHAPTERS.length}
            aria-valuenow={completedCount}
          >
            <span style={{ width: `${(completedCount / TUTORIAL_CHAPTERS.length) * 100}%` }} />
          </div>
        </div>
      </header>
      {!available && (
        <p className="tutorial-catalog-notice">
          {tr('Die interaktive Einführung ist in der Desktop-App verfügbar.', 'The interactive introduction is available in the desktop app.')}
        </p>
      )}
      {error && (
        <p role="alert" className="tutorial-catalog-error">
          {error}
        </p>
      )}
      <div className="tutorial-catalog-layout">
        <nav className="tutorial-topics" aria-label={tr('Lektionsbereiche', 'Lesson topics')}>
          <span className="tutorial-topics-label">{tr('Bereiche', 'Topics')}</span>
          {[{ id: 'all' as const }, ...TUTORIAL_SECTIONS].map(({ id }) => {
            const Icon = id === 'all' ? Layers : topicIcons[id];
            const count = matches.filter((chapter) => id === 'all' || tutorialSection(chapter) === id).length;
            return (
              <button
                type="button"
                key={id}
                className={`tutorial-topic${topic === id ? ' is-active' : ''}`}
                aria-pressed={topic === id}
                onClick={() => selectTopic(id)}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{topicLabel(id)}</span>
                <span className="tutorial-topic-count">{count}</span>
              </button>
            );
          })}
        </nav>
        <div className="tutorial-catalog-results" ref={resultsRef}>
          <div className="tutorial-catalog-results-heading">
            <h3>{topicLabel(topic)}</h3>
            <span role="status">
              {terms.length
                ? tr(`${chapters.length} Treffer`, chapters.length === 1 ? '1 result' : `${chapters.length} results`)
                : chapters.length === 1
                  ? tr('1 Lektion', '1 lesson')
                  : tr(`${chapters.length} Lektionen`, `${chapters.length} lessons`)}
            </span>
          </div>
          {TUTORIAL_SECTIONS.map((section) => {
            const lessons = chapters.filter((chapter) => tutorialSection(chapter) === section.id);
            return (
              lessons.length > 0 && (
                <section className="tutorial-catalog-group" key={section.id} aria-label={tutorialText(section.title, language)}>
                  {topic === 'all' && <h4 className="tutorial-catalog-group-title">{tutorialText(section.title, language)}</h4>}
                  <div className="tutorial-lesson-list">
                    {lessons.map((chapter) => (
                      <TutorialLessonRow
                        key={chapter.id}
                        chapter={chapter}
                        completed={completed.includes(chapter.id)}
                        expanded={expanded === chapter.id}
                        disabled={busy || !available}
                        onToggle={() => setExpanded((previous) => (previous === chapter.id ? null : chapter.id))}
                        onStart={start}
                      />
                    ))}
                  </div>
                </section>
              )
            );
          })}
          {!chapters.length && (
            <div className="tutorial-catalog-empty">
              <Search size={24} aria-hidden="true" />
              <h4>{tr('Keine passenden Lektionen', 'No matching lessons')}</h4>
              <p>{tr('Versuche einen anderen Suchbegriff oder wähle einen anderen Bereich.', 'Try another search term or choose a different topic.')}</p>
              <div>
                {topic !== 'all' && (
                  <Button variant="ghost" onClick={() => selectTopic('all')}>
                    {tr('Alle Bereiche durchsuchen', 'Search all topics')}
                  </Button>
                )}
                {query && onClearSearch && (
                  <Button variant="ghost" onClick={onClearSearch}>
                    {tr('Suche leeren', 'Clear search')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
