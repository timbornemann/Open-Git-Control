import type { TutorialCommitSetup, TutorialText } from './types';

export const COMMIT_MESSAGE: TutorialText = ['Lernprojekt dokumentieren', 'Document the learning project'];
export const COMMIT_DESCRIPTION: TutorialText = ['Erklärt den Einstieg in das Lernprojekt.', 'Explains how to get started with the learning project.'];
export const COMMIT_TITLE: TutorialText = [`docs(lernen): ${COMMIT_MESSAGE[0]}`, `docs(lernen): ${COMMIT_MESSAGE[1]}`];
export function commitSetup(stage: number): TutorialCommitSetup {
  return {
    subject: stage === 0 ? ['', ''] : stage === 1 ? ['docs: ', 'docs: '] : stage === 2 ? ['docs(lernen): ', 'docs(lernen): '] : COMMIT_TITLE,
    ...(stage >= 4 ? { description: COMMIT_DESCRIPTION } : {}),
    signoff: stage >= 5,
  };
}
