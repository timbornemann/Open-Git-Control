type WorkingDirectoryEntryKind = 'file' | 'directory';

/**
 * Returns a non-conflicting destination that keeps the original entry intact.
 * File extensions are retained so file associations and syntax detection continue to work.
 */
export const getAvailableWorkingDirectoryCopyPath = (targetPath: string, kind: WorkingDirectoryEntryKind, existingPaths: Iterable<string>): string => {
  const existing = new Set(existingPaths);
  const separatorIndex = targetPath.lastIndexOf('/');
  const parentPath = separatorIndex === -1 ? '' : targetPath.slice(0, separatorIndex + 1);
  const name = separatorIndex === -1 ? targetPath : targetPath.slice(separatorIndex + 1);
  const extensionIndex = kind === 'file' ? name.lastIndexOf('.') : -1;
  const hasExtension = extensionIndex > 0;
  const stem = hasExtension ? name.slice(0, extensionIndex) : name;
  const extension = hasExtension ? name.slice(extensionIndex) : '';

  for (let copyNumber = 1; ; copyNumber += 1) {
    const suffix = copyNumber === 1 ? ' (copy)' : ` (copy ${copyNumber})`;
    const candidate = `${parentPath}${stem}${suffix}${extension}`;
    if (!existing.has(candidate)) return candidate;
  }
};
