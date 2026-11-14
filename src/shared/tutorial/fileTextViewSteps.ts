import type { TutorialStep } from './types';
import { editor, element, fileTab } from './fileLessonHelpers';

/** Expand only the named file-opening steps; existing step IDs stay stable. */
export function withTextViewSteps(paths: Readonly<Record<string, string>>) {
  return (step: TutorialStep): TutorialStep[] => (paths[step.id] ? withTextViewStep(step, paths[step.id]) : [step]);
}

/** Teach the real Preview → Text navigation when opening a previewable file. */
export function withTextViewStep(open: TutorialStep, path: string): TutorialStep[] {
  const viewer = `.file-viewer[data-path=${JSON.stringify(path)}]`;
  return [
    {
      ...open,
      description: [
        `Klicke ${path} im Dateibaum. Die Arbeitsdatei öffnet sich in der Vorschau. Im nächsten Schritt wechselst du zur Textansicht.`,
        `Click ${path} in the file tree. The working file opens in Preview. In the next step you will switch to Text.`,
      ],
      completion: element(viewer),
    },
    {
      ...open,
      id: `${open.id}-text`,
      title: ['Wechsle zur Textansicht', 'Switch to Text'],
      description: [
        'Klicke Text. Dort siehst du die tatsächlichen Dateizeichen und kannst die Arbeitsdatei bearbeiten. Die gerenderte Ansicht bleibt unter Vorschau verfügbar.',
        'Click Text. It shows the actual file characters and lets you edit the working file. The rendered view remains available under Preview.',
      ],
      target: fileTab('text'),
      prepare: {
        ...open.prepare,
        actions: [...(open.prepare?.actions || []), { click: open.target }],
        ready: `${viewer} [data-file-tab="text"]`,
      },
      completion: {
        kind: 'all',
        conditions: [...(open.completion ? [open.completion] : []), element(`${viewer}[data-tab="text"] ${editor}`)],
      },
    },
  ];
}
