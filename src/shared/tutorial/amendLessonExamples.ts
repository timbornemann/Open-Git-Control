import type { TutorialText } from './types';
export const AMEND_ORIGINAL_SUBJECT: TutorialText = ['feat: Begrüßung ergänzen', 'feat: update greeting'];
export const AMEND_ORIGINAL_MESSAGE: TutorialText = [AMEND_ORIGINAL_SUBJECT[0].slice('feat: '.length), AMEND_ORIGINAL_SUBJECT[1].slice('feat: '.length)];
export const AMEND_ORIGINAL_DESCRIPTION: TutorialText = ['Den gespeicherten Projektinhalt aktualisieren.', 'Update the saved project contents.'];
export const AMEND_CONTENT: TutorialText = [
  '# OGC-Lernprojekt\n\nBegrüßung: Hallo Team!\nStatus: Bereit\n',
  '# OGC-Lernprojekt\n\nGreeting: Hello team!\nStatus: Ready\n',
];
export const AMEND_FILE_MESSAGE: TutorialText = ['Begrüßung für das Team korrigieren', 'correct the team greeting'];
export const AMEND_FILE_DESCRIPTION: TutorialText = [
  'Die Team-Begrüßung gehört zum selben lokalen Arbeitsschritt.',
  'The team greeting belongs to the same local piece of work.',
];
export const AMEND_MESSAGE_ONLY: TutorialText = ['Begrüßung auf der Startseite ergänzen', 'add the greeting to the home page'];
export const AMEND_DESCRIPTION_ONLY: TutorialText = [
  'Die Nachricht beschreibt den vorhandenen Dateiinhalt genauer.',
  'The message describes the existing file contents more precisely.',
];
