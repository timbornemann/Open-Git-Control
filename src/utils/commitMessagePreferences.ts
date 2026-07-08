import type {
  AiCommitMessageLanguageDto,
  AiCommitMessageStyleDto,
} from '../global';
import type { CatalogTranslateFn } from '../i18n';

type Translate = CatalogTranslateFn;

export const getCommitMessageStyleLabel = (
  style: AiCommitMessageStyleDto,
  t: Translate,
): string => {
  switch (style) {
    case 'plain':
      return t('commitMessage.styles.plain');
    case 'detailed':
      return t('commitMessage.styles.detailed');
    case 'conventional':
    default:
      return t('commitMessage.styles.conventional');
  }
};

export const getCommitMessageLanguageLabel = (
  language: AiCommitMessageLanguageDto,
  t: Translate,
): string => {
  switch (language) {
    case 'de':
      return t('commitMessage.languages.german');
    case 'en':
      return t('commitMessage.languages.english');
    case 'auto':
    default:
      return t('commitMessage.languages.auto');
  }
};

export const getCommitMessageLanguageOptions = (t: Translate): Array<{ value: AiCommitMessageLanguageDto; label: string }> => [
  { value: 'auto', label: getCommitMessageLanguageLabel('auto', t) },
  { value: 'de', label: getCommitMessageLanguageLabel('de', t) },
  { value: 'en', label: getCommitMessageLanguageLabel('en', t) },
];

export const getCommitMessageStyleOptions = (t: Translate): Array<{ value: AiCommitMessageStyleDto; label: string }> => [
  { value: 'conventional', label: getCommitMessageStyleLabel('conventional', t) },
  { value: 'plain', label: getCommitMessageStyleLabel('plain', t) },
  { value: 'detailed', label: getCommitMessageStyleLabel('detailed', t) },
];

export const getCommitMessageStyleExample = (
  style: AiCommitMessageStyleDto,
  language: AiCommitMessageLanguageDto,
  t: Translate,
): { title: string; description: string } => {
  const useGerman = language === 'de';

  if (style === 'plain') {
    return useGerman
      ? {
        title: 'verbessere Clone-Fortschritt',
        description: t('commitMessage.examples.plainDescriptionHint'),
      }
      : {
        title: 'improve clone progress',
        description: t('commitMessage.examples.plainDescriptionHint'),
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
  t: Translate,
): string => {
  const example = getCommitMessageStyleExample(style, language, t);
  const description = example.description.trim();
  return description
    ? `${example.title}\n\n${description}`
    : example.title;
};
