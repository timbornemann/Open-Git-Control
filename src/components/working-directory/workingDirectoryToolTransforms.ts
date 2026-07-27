import type { WorkingDirectoryEntryDto, WorkingDirectoryMoveDto } from '@/shared/ipc/contracts/git';
import { escapeGitignoreLiteralPath } from '@/utils/gitignorePattern';

export type NormalizeNameOptions = {
  lowercase: boolean;
  hyphenateSpaces: boolean;
  replaceUmlauts: boolean;
};

export const basename = (value: string) => value.split('/').pop() || value;
export const parentPath = (value: string) => (value.includes('/') ? value.slice(0, value.lastIndexOf('/')) : '');
export const isSameOrDescendantPath = (candidatePath: string, parent: string) => candidatePath === parent || candidatePath.startsWith(`${parent}/`);
export const isEntryName = (value: string) => value.length > 0 && value !== '.' && value !== '..' && !/[\\/]/.test(value);
export const getTopLevelEntries = (entries: WorkingDirectoryEntryDto[]) =>
  entries.filter((entry) => !entries.some((candidate) => candidate.path !== entry.path && isSameOrDescendantPath(entry.path, candidate.path)));
export const hasNestedSelection = (entries: WorkingDirectoryEntryDto[]) => getTopLevelEntries(entries).length !== entries.length;

const joinPath = (parent: string, name: string) => (parent ? `${parent}/${name}` : name);
const splitFileName = (entry: WorkingDirectoryEntryDto): { stem: string; extension: string } => {
  if (entry.kind !== 'file') return { stem: entry.name, extension: '' };
  const extensionStart = entry.name.lastIndexOf('.');
  return extensionStart > 0 ? { stem: entry.name.slice(0, extensionStart), extension: entry.name.slice(extensionStart) } : { stem: entry.name, extension: '' };
};
const toMove = (entry: WorkingDirectoryEntryDto, name: string): WorkingDirectoryMoveDto => ({
  sourcePath: entry.path,
  targetPath: joinPath(parentPath(entry.path), name),
});
const changedMoves = (entries: WorkingDirectoryEntryDto[], nameForEntry: (entry: WorkingDirectoryEntryDto) => string): WorkingDirectoryMoveDto[] =>
  getTopLevelEntries(entries)
    .map((entry) => toMove(entry, nameForEntry(entry)))
    .filter((move) => move.sourcePath !== move.targetPath);

export const addAffixMoves = (entries: WorkingDirectoryEntryDto[], prefix: string, suffix: string): WorkingDirectoryMoveDto[] =>
  changedMoves(entries, (entry) => {
    const { stem, extension } = splitFileName(entry);
    return `${prefix}${stem}${suffix}${extension}`;
  });

export const removeAffixMoves = (entries: WorkingDirectoryEntryDto[], prefix: string, suffix: string): WorkingDirectoryMoveDto[] =>
  changedMoves(entries, (entry) => {
    const parts = splitFileName(entry);
    let stem = parts.stem;
    if (prefix && stem.startsWith(prefix)) stem = stem.slice(prefix.length);
    if (suffix && stem.endsWith(suffix)) stem = stem.slice(0, -suffix.length);
    return `${stem}${parts.extension}`;
  });

export const changeExtensionMoves = (entries: WorkingDirectoryEntryDto[], requestedExtension: string): WorkingDirectoryMoveDto[] => {
  const extension = requestedExtension.replace(/^\.+/, '');
  return changedMoves(
    entries.filter((entry) => entry.kind === 'file'),
    (entry) => `${splitFileName(entry).stem}.${extension}`,
  );
};

const replaceGermanCharacters = (value: string): string =>
  value.replace(/[ÄÖÜäöüß]/g, (character) => ({ Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[character] || character);

export const normalizeNameMoves = (entries: WorkingDirectoryEntryDto[], options: NormalizeNameOptions): WorkingDirectoryMoveDto[] =>
  changedMoves(entries, (entry) => {
    let name = entry.name;
    if (options.replaceUmlauts) name = replaceGermanCharacters(name);
    if (options.hyphenateSpaces) name = name.replace(/\s+/g, '-');
    if (options.lowercase) name = name.toLowerCase();
    return name;
  });

const extensionOf = (name: string): string => {
  const extensionStart = name.lastIndexOf('.');
  return extensionStart > 0 ? name.slice(extensionStart + 1).toLowerCase() : '';
};

const FILE_TYPE_FOLDERS = new Map<string, string>([
  ...['apng', 'avif', 'bmp', 'gif', 'heic', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp'].map((extension) => [extension, 'images'] as const),
  ...['csv', 'doc', 'docx', 'epub', 'md', 'ods', 'odt', 'pdf', 'ppt', 'pptx', 'rtf', 'txt', 'xls', 'xlsx'].map(
    (extension) => [extension, 'documents'] as const,
  ),
  ...['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav', 'wma'].map((extension) => [extension, 'audio'] as const),
  ...['avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'webm', 'wmv'].map((extension) => [extension, 'video'] as const),
  ...['7z', 'bz2', 'gz', 'rar', 'tar', 'tgz', 'xz', 'zip'].map((extension) => [extension, 'archives'] as const),
]);

export const fileTypeFolder = (name: string): string => FILE_TYPE_FOLDERS.get(extensionOf(name)) || 'other';

export const sortByFileTypeMoves = (entries: WorkingDirectoryEntryDto[]): WorkingDirectoryMoveDto[] =>
  entries
    .filter((entry) => entry.kind === 'file')
    .map((entry) => {
      const folder = fileTypeFolder(entry.name);
      const parent = parentPath(entry.path);
      return {
        sourcePath: entry.path,
        targetPath: basename(parent).toLowerCase() === folder ? entry.path : joinPath(joinPath(parent, folder), entry.name),
      };
    })
    .filter((move) => move.sourcePath !== move.targetPath);

export const selectedPathText = (entries: WorkingDirectoryEntryDto[], repoPath: string, absolute: boolean): string => {
  if (!absolute) return entries.map((entry) => entry.path).join('\n');
  const separator = repoPath.includes('\\') ? '\\' : '/';
  const root = repoPath.replace(/[\\/]+$/, '');
  return entries.map((entry) => `${root}${separator}${entry.path.replace(/\//g, separator)}`).join('\n');
};

export const gitignorePatterns = (entries: WorkingDirectoryEntryDto[], mode: 'exact' | 'extensions'): string[] => {
  if (mode === 'extensions') {
    return [
      ...new Set(
        entries
          .filter((entry) => entry.kind === 'file')
          .map((entry) => extensionOf(entry.name))
          .filter(Boolean),
      ),
    ].map((extension) => `*.${extension}`);
  }
  return entries.map((entry) => `/${escapeGitignoreLiteralPath(entry.path)}${entry.kind === 'directory' ? '/' : ''}`);
};

export const commonEntryParent = (entries: WorkingDirectoryEntryDto[]): string => {
  if (entries.length === 0) return '';
  const parents = entries.map((entry) => parentPath(entry.path));
  const firstSegments = parents[0].split('/').filter(Boolean);
  let sharedLength = firstSegments.length;
  for (const candidate of parents.slice(1)) {
    const segments = candidate.split('/').filter(Boolean);
    const mismatchIndex = segments.findIndex((segment, index) => segment !== firstSegments[index]);
    sharedLength = Math.min(sharedLength, mismatchIndex < 0 ? segments.length : mismatchIndex);
  }
  return firstSegments.slice(0, sharedLength).join('/');
};
