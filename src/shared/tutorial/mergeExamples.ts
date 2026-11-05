import type { TutorialText } from './types';

export const mergeLicenseNote: TutorialText = [
  '\nProjekthinweis: Dieses Lernprojekt dient zum sicheren Üben.\n',
  '\nProject note: This learning project is for safe practice.\n',
];

export const conflictBothContent: TutorialText = [
  '# OGC-Lernprojekt\n\nBegrüßung: Hallo Welt!\nBegrüßung: Hallo Team!\nStatus: Bereit\n',
  '# OGC-Lernprojekt\n\nGreeting: Hello world!\nGreeting: Hello team!\nStatus: Ready\n',
];
export const conflictManualContent: TutorialText = [
  '# OGC-Lernprojekt\n\nBegrüßung: Gemeinsam lernen!\nStatus: Bereit\n',
  '# OGC-Lernprojekt\n\nGreeting: Learn together!\nStatus: Ready\n',
];
export const conflictIncompleteContent: TutorialText = [
  '# OGC-Lernprojekt\n\n<<<<<<< HEAD\nBegrüßung: Unfertiger Entwurf\n',
  '# OGC-Lernprojekt\n\n<<<<<<< HEAD\nGreeting: Unfinished draft\n',
];
export const conflictAbortDraftMessage: TutorialText = [
  'Beim Abbrechen würde ein neuerer Arbeitsentwurf überschrieben. Sichere ihn separat, bevor du es erneut versuchst.',
  'A later working draft would be overwritten by abort. Preserve it separately before retrying.',
];
