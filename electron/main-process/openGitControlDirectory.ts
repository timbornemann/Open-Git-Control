import * as fs from 'fs';
import * as path from 'path';
import { resolveRepositoryPathForCreate } from '../git/RepositoryPathSafety';
import { writeTextFileAtomically } from './atomicFile';

export const OPEN_GIT_CONTROL_DIRECTORY = '.Open-Git-Control';
export const OPEN_GIT_CONTROL_README_FILE = 'README.md';

const OPEN_GIT_CONTROL_README_CONTENT = `# Open Git Control repository data

This directory contains repository-local data created by [Open Git Control](https://github.com/timbornemann/Open-Git-Control):

- \`run.json\` is the repository-local workflow configuration for optional command workflows in the **Run** menu.
- \`planning.json\` contains this repository's project plan and todos.

Commit this directory when you want to share and version these workflows and planning data with your team. Both files are optional and are only created when their respective feature is used.

## Created with Open Git Control

[Open Git Control](https://github.com/timbornemann/Open-Git-Control) is a desktop app for working with local Git repositories. It brings together staging and commits, branches and remotes, a commit graph, GitHub tools, project planning, AI assistance, and configurable repository workflows.

- [Open the Open Git Control repository](https://github.com/timbornemann/Open-Git-Control)
- [View Open Git Control releases](https://github.com/timbornemann/Open-Git-Control/releases)
`;

const LEGACY_RUN_WORKFLOW_README_CONTENT = `# Open Git Control run workflows

This directory contains \`run.json\`, the repository-local workflow configuration used by Open Git Control's **Run** menu. It can define command steps for running, testing, formatting, starting, and building this repository. Open Git Control selects the command for the current platform and runs each configured step in order.

Commit this directory when you want to share the same repository workflows with your team.

## Created with Open Git Control

[Open Git Control](https://github.com/timbornemann/Open-Git-Control) is a desktop app for working with local Git repositories. It brings together staging and commits, branches and remotes, a commit graph, GitHub tools, project planning, AI assistance, and configurable repository workflows.

- [Open the Open Git Control repository](https://github.com/timbornemann/Open-Git-Control)
- [View Open Git Control releases](https://github.com/timbornemann/Open-Git-Control/releases)
`;

const pathExistsWithoutFollowingLinks = (filePath: string): boolean => {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};

export function getOpenGitControlAssetPath(repoPath: string, fileName: string, label: string): string {
  const physicalRepoPath = fs.realpathSync(repoPath);
  const directoryPath = path.join(physicalRepoPath, OPEN_GIT_CONTROL_DIRECTORY);
  if (pathExistsWithoutFollowingLinks(directoryPath) && fs.lstatSync(directoryPath).isSymbolicLink()) {
    throw new Error('Open Git Control directory cannot be a symbolic link.');
  }
  return resolveRepositoryPathForCreate(physicalRepoPath, `${OPEN_GIT_CONTROL_DIRECTORY}/${fileName}`, label);
}

export function ensureOpenGitControlReadme(repoPath: string): void {
  const readmePath = getOpenGitControlAssetPath(repoPath, OPEN_GIT_CONTROL_README_FILE, 'Open Git Control README path');
  if (!pathExistsWithoutFollowingLinks(readmePath)) {
    writeTextFileAtomically(readmePath, OPEN_GIT_CONTROL_README_CONTENT);
    return;
  }
  if (fs.readFileSync(readmePath, 'utf8') === LEGACY_RUN_WORKFLOW_README_CONTENT) {
    writeTextFileAtomically(readmePath, OPEN_GIT_CONTROL_README_CONTENT);
  }
}
