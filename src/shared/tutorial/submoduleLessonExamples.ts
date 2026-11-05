import { practiceCommitHash } from './exampleGitIds';
export const SUBMODULE_PATH = 'packages/design';
export const SUBMODULE_RECORDED = practiceCommitHash(201);
export const SUBMODULE_OTHER = practiceCommitHash(202);
export const SUBMODULE_ORIGINAL_URL = 'https://git.example.invalid/lernen/design.git';
export const SUBMODULE_NEW_URL = 'https://git.example.invalid/lernen/design-moved.git';
export const submoduleConfiguration = (url: string) => '[submodule "design"]\n\tpath = ' + SUBMODULE_PATH + '\n\turl = ' + url + '\n';
