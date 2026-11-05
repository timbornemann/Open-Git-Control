import type { TutorialFileContent, HunkExample } from './types';
export type { HunkExample } from './types';
/** Metadata carries scenario IDs; the private renderer loads the file contents. */
export const hunkText = (version: HunkExample): TutorialFileContent => ({ example: 'readme-hunks', version });
