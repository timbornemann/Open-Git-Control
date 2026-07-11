import type { AiCommitMessageLanguageDto } from '@/types/aiDtos';
import type { PlannerItem, PlannerPriority, PlannerProject, PlannerStatus } from '@/types/projectPlanner';

export type PlannerPromptItem = Pick<PlannerItem, 'title' | 'description' | 'priority' | 'status' | 'tags'>;
export type PlannerPromptLanguage = 'de' | 'en';

type PlannerPromptParams = {
  project: PlannerProject;
  items: PlannerPromptItem[];
  language: AiCommitMessageLanguageDto;
};

type PlannerPromptCopy = {
  labels: {
    project: string;
    projectDescription: string;
    repository: string;
    projectKind: string;
    noRepository: string;
    workItems: string;
    title: string;
    status: string;
    priority: string;
    tags: string;
    description: string;
    none: string;
  };
  intro: string;
  completion: string;
  plannedProject: string;
  repositoryProject: string;
  instructions: Record<PlannerStatus, string>;
  statuses: Record<PlannerStatus, string>;
  priorities: Record<PlannerPriority, string>;
};

const COPY: Record<PlannerPromptLanguage, PlannerPromptCopy> = {
  de: {
    labels: {
      project: 'Projekt',
      projectDescription: 'Projektbeschreibung',
      repository: 'Repository',
      projectKind: 'Projekttyp',
      noRepository: 'Kein Repository verknuepft',
      workItems: 'Arbeitsauftraege',
      title: 'Titel',
      status: 'Status',
      priority: 'Prioritaet',
      tags: 'Tags',
      description: 'Beschreibung',
      none: 'Keine',
    },
    intro:
      'Du bist ein Coding-Agent. Bearbeite die folgenden Arbeitsauftraege vollstaendig im bestehenden Projekt. Untersuche zuerst den relevanten Code und die vorhandenen Muster; erfinde keine Anforderungen, die nicht aus dem Kontext hervorgehen.',
    completion:
      'Setze die Arbeit sauber um, fuehre passende Tests oder Pruefungen aus und berichte anschliessend knapp ueber Aenderungen, Validierung und verbleibende Risiken.',
    plannedProject: 'Geplantes Projekt',
    repositoryProject: 'Repository-Projekt',
    instructions: {
      idea: 'Mache aus der Idee eine passende, kleine und wartbare Umsetzung. Klaere den relevanten Codekontext und implementiere die Loesung mit angemessener Validierung.',
      bug: 'Reproduziere oder analysiere die Fehlerursache, behebe sie vollstaendig und sichere sie mit einem passenden Regressionstest oder einer gezielten Pruefung ab.',
      planned: 'Implementiere die geplante Aenderung vollstaendig im vorhandenen Stil und validiere sie mit passenden Tests oder Builds.',
      'in-progress':
        'Pruefe den bestehenden Zwischenstand, fuehre die begonnene Arbeit konsistent fort und vermeide das Zuruecknehmen bereits korrekter Teile.',
      blocked:
        'Untersuche die Blockade und loese sie, soweit dies im Repository moeglich ist. Frage nur nach, wenn externe Rechte oder eine Produktentscheidung zwingend fehlen.',
      done: 'Pruefe die bisherige Umsetzung gegen den Arbeitsauftrag und bessere nur verbleibende Abweichungen, Fehler oder fehlende Validierung nach.',
    },
    statuses: {
      idea: 'Idee',
      bug: 'Fehler',
      planned: 'Geplant',
      'in-progress': 'In Arbeit',
      blocked: 'Blockiert',
      done: 'Erledigt',
    },
    priorities: { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', urgent: 'Dringend' },
  },
  en: {
    labels: {
      project: 'Project',
      projectDescription: 'Project description',
      repository: 'Repository',
      projectKind: 'Project type',
      noRepository: 'No repository linked',
      workItems: 'Work items',
      title: 'Title',
      status: 'Status',
      priority: 'Priority',
      tags: 'Tags',
      description: 'Description',
      none: 'None',
    },
    intro:
      'You are a coding agent. Complete the following work items in the existing project. First inspect the relevant code and established patterns; do not invent requirements that are not supported by the context.',
    completion: 'Implement the work cleanly, run appropriate tests or checks, then briefly report changes, validation, and remaining risks.',
    plannedProject: 'Planned project',
    repositoryProject: 'Repository project',
    instructions: {
      idea: 'Turn the idea into a suitable, small, maintainable implementation. Establish the relevant code context and implement the solution with appropriate validation.',
      bug: 'Reproduce or analyze the root cause, fix it completely, and protect it with an appropriate regression test or focused verification.',
      planned: 'Implement the planned change completely in the existing style and validate it with suitable tests or builds.',
      'in-progress': 'Review the current in-progress state, continue the work consistently, and do not undo parts that are already correct.',
      blocked:
        'Investigate and resolve the blocker where possible in the repository. Ask only when external authority or a product decision is strictly required.',
      done: 'Verify the existing implementation against the work item and improve only remaining gaps, defects, or missing validation.',
    },
    statuses: {
      idea: 'Idea',
      bug: 'Bug',
      planned: 'Planned',
      'in-progress': 'In progress',
      blocked: 'Blocked',
      done: 'Done',
    },
    priorities: { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' },
  },
};

export const resolvePlannerPromptLanguage = (language: AiCommitMessageLanguageDto): PlannerPromptLanguage => (language === 'de' ? 'de' : 'en');

const formatItem = (item: PlannerPromptItem, copy: PlannerPromptCopy, index: number): string[] => [
  `${index + 1}. ${copy.labels.title}: ${item.title.trim() || copy.labels.none}`,
  `   ${copy.labels.status}: ${copy.statuses[item.status]}`,
  `   ${copy.labels.priority}: ${copy.priorities[item.priority]}`,
  `   ${copy.labels.tags}: ${item.tags.length > 0 ? item.tags.join(', ') : copy.labels.none}`,
  `   ${copy.labels.description}: ${item.description.trim() || copy.labels.none}`,
  `   ${copy.instructions[item.status]}`,
];

const formatProjectContext = (project: PlannerProject, copy: PlannerPromptCopy): string[] => [
  `${copy.labels.project}: ${project.name}`,
  `${copy.labels.projectKind}: ${project.kind === 'repository' ? copy.repositoryProject : copy.plannedProject}`,
  `${copy.labels.repository}: ${project.repoPath || copy.labels.noRepository}`,
  ...(project.description.trim() ? [`${copy.labels.projectDescription}: ${project.description.trim()}`] : []),
];

export const buildPlannerAgentPrompt = ({ project, items, language }: PlannerPromptParams): string => {
  const copy = COPY[resolvePlannerPromptLanguage(language)];
  return [
    copy.intro,
    '',
    ...formatProjectContext(project, copy),
    '',
    `${copy.labels.workItems}:`,
    ...items.flatMap((item, index) => formatItem(item, copy, index)),
    '',
    copy.completion,
  ].join('\n');
};

export const buildPlannerCommitNotes = ({ project, items, language }: PlannerPromptParams): string => {
  const copy = COPY[resolvePlannerPromptLanguage(language)];
  return [...formatProjectContext(project, copy), '', `${copy.labels.workItems}:`, ...items.flatMap((item, index) => formatItem(item, copy, index))].join('\n');
};
