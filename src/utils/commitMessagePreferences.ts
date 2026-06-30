import type {
  AiCommitMessageLanguageDto,
  AiCommitMessageStyleDto,
} from '../global';

type Translate = (deText: string, enText: string) => string;

export const getCommitMessageStyleLabel = (
  style: AiCommitMessageStyleDto,
  tr: Translate,
): string => {
  switch (style) {
    case 'plain':
      return tr('Plain', 'Plain');
    case 'detailed':
      return tr('Detailliert', 'Detailed');
    case 'conventional':
    default:
      return tr('Conventional Commits', 'Conventional Commits');
  }
};

export const getCommitMessageLanguageLabel = (
  language: AiCommitMessageLanguageDto,
  tr: Translate,
): string => {
  switch (language) {
    case 'de':
      return tr('Deutsch', 'German');
    case 'en':
      return tr('Englisch', 'English');
    case 'auto':
    default:
      return tr('Automatisch aus Notizen', 'Auto from notes');
  }
};

export const getCommitMessageLanguageOptions = (tr: Translate): Array<{ value: AiCommitMessageLanguageDto; label: string }> => [
  { value: 'auto', label: getCommitMessageLanguageLabel('auto', tr) },
  { value: 'de', label: getCommitMessageLanguageLabel('de', tr) },
  { value: 'en', label: getCommitMessageLanguageLabel('en', tr) },
];

export const getCommitMessageStyleOptions = (tr: Translate): Array<{ value: AiCommitMessageStyleDto; label: string }> => [
  { value: 'conventional', label: getCommitMessageStyleLabel('conventional', tr) },
  { value: 'plain', label: getCommitMessageStyleLabel('plain', tr) },
  { value: 'detailed', label: getCommitMessageStyleLabel('detailed', tr) },
];

export const getCommitMessageStyleExample = (
  style: AiCommitMessageStyleDto,
  language: AiCommitMessageLanguageDto,
  tr: Translate,
): { title: string; description: string } => {
  const useGerman = language === 'de';

  if (style === 'plain') {
    return useGerman
      ? {
        title: 'verbessere Clone-Fortschritt',
        description: tr('Beschreibung meist leer; nur bei wichtigem Kontext nutzen.', 'Description usually empty; only use it for important context.'),
      }
      : {
        title: 'improve clone progress',
        description: tr('Beschreibung meist leer; nur bei wichtigem Kontext nutzen.', 'Description usually empty; only use it for important context.'),
      };
  }

  if (style === 'detailed') {
    return useGerman
      ? {
        title: 'verbessere Fortschritt fuer Clone und Pull',
        description: 'Zeigt Receiving und Resolving als getrennte Ladezustaende.\nReduziert die rohe Git-Ausgabe auf relevante Statusdetails.',
      }
      : {
        title: 'improve clone and pull progress feedback',
        description: 'Shows Receiving and Resolving as separate loading states.\nReduces raw git output to relevant status details.',
      };
  }

  return useGerman
    ? {
      title: 'feat(git): zeige Transfer-Fortschritt',
      description: 'Stellt Receiving und Resolving als eigene Fortschrittsphasen dar.',
    }
    : {
      title: 'feat(git): show transfer progress phases',
      description: 'Shows Receiving and Resolving as separate progress phases.',
    };
};

export const formatCommitMessageStyleExample = (
  style: AiCommitMessageStyleDto,
  language: AiCommitMessageLanguageDto,
  tr: Translate,
): string => {
  const example = getCommitMessageStyleExample(style, language, tr);
  const description = example.description.trim();
  return description
    ? `${example.title}\n\n${description}`
    : example.title;
};
