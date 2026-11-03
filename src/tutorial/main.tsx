import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/data/queryClient';
import { startDataRuntime } from '@/data/bootstrap';
import { setIsolatedElectronApi } from '@/services/electronApi';
import { TUTORIAL_CHAPTERS, resolveTutorialRequest } from '@/shared/tutorial/catalog';
import { createDemoApi } from './demoApi';
import { TutorialApp } from './TutorialApp';
import '@/index.css';

async function start() {
  const host = window.tutorialHost;
  if (!host || window.electronAPI) throw new Error('The tutorial must run in its isolated host.');
  const context = await host.getContext();
  const request = resolveTutorialRequest(context.request);
  const chapter = TUTORIAL_CHAPTERS.find((entry) => entry.id === request.chapterId)!;
  const step = chapter.steps.find((entry) => entry.id === request.stepId) || chapter.steps[0];
  const initial = createDemoApi(context, step);
  setIsolatedElectronApi(initial.api);
  await startDataRuntime();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={queryClient}>
      <TutorialApp context={context} initial={initial} />
    </QueryClientProvider>,
  );
}
void start().catch(() => {
  document.getElementById('root')!.textContent = 'Die Einführung konnte nicht geladen werden. / The introduction could not be loaded.';
  void window.tutorialHost?.close(true);
});
