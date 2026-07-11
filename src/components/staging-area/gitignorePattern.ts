/** Escapes a repository-relative path so .gitignore treats it literally. */
export const escapeGitignoreLiteralPath = (value: string): string => {
  return value
    .split('/')
    .map((segment) => segment.replace(/([\\#!*?\[\]])/g, '\\$1').replace(/^ +| +$/g, (spaces) => spaces.replace(/ /g, '\\ ')))
    .join('/');
};
