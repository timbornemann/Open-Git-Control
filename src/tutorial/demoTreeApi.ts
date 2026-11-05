import type { ElectronGitAPI, WorkingDirectoryEntryDto, WorkingDirectoryMutationResultDto } from '@/shared/ipc/contracts/git';
import type { DemoRepository } from './demoRepository';
import type { DemoFiles } from './demoBlob';
import { demoBlobBytes, isDemoGitlink } from './demoBlob';
import { refreshDemoFiles } from './demoFiles';
import { demoParent, demoDescendant, validDemoTreePath } from './demoDirectories';
import { touchDemoWorkFile } from './demoFileVersions';

const has = (files: DemoFiles, path: string) => Object.prototype.hasOwnProperty.call(files, path);
const error = (message: string): WorkingDirectoryMutationResultDto => ({ success: false, error: message });
const messages = {
  scope: 'Das Übungsrepository ist nicht mehr aktuell. / The practice repository changed.',
  path: 'Wähle einen gültigen relativen Übungspfad. / Choose a valid relative practice path.',
  parent: 'Der Zielordner ist nicht vorhanden. / The destination folder does not exist.',
  exists: 'Der Eintrag existiert bereits. / The entry already exists.',
  missing: 'Der Übungseintrag ist nicht vorhanden. / The practice entry does not exist.',
  nested: 'Ein Ordner kann nicht in sich selbst kopiert oder verschoben werden. / A folder cannot be copied or moved into itself.',
};
const kindAt = (repo: DemoRepository, path: string) =>
  isDemoGitlink(repo.files[path]) ? 'directory' : has(repo.files, path) ? 'file' : repo.directories.has(path) ? 'directory' : null;
const collisionAt = (repo: DemoRepository, path: string) =>
  [...Object.keys(repo.files), ...repo.directories].find((entry) => entry.toLowerCase() === path.toLowerCase());
const put = (files: DemoFiles, path: string, value: DemoFiles[string]) =>
  Object.defineProperty(files, path, { value, enumerable: true, configurable: true, writable: true });

/** Real in-memory tree mutations. HEAD/index and native filesystem are never written. */
export function createDemoTreeApi(repo: DemoRepository): Partial<ElectronGitAPI> {
  const validate = (repoPath: string, path: string, root = false) =>
    repoPath !== repo.activeRepo ? messages.scope : !validDemoTreePath(path, root) ? messages.path : null;
  const protectsSubmodule = (path: string) =>
    [...repo.submodules.keys()].some(
      (entry) => demoDescendant(entry.toLowerCase(), path.toLowerCase()) || demoDescendant(path.toLowerCase(), entry.toLowerCase()),
    );
  const moduleMessage =
    'Submodul-Dateiaktionen sind in dieser Übung nicht verfügbar. Nutze die Submodul-Karte. / Submodule file actions are unavailable in this exercise. Use the submodule card.';
  const transferError = (source: string, target: string, repoPath: string) =>
    validate(repoPath, source) || validate(repoPath, target) || (protectsSubmodule(source) || protectsSubmodule(target) ? moduleMessage : null);
  const publish = (paths: Iterable<string>, event: string) => {
    refreshDemoFiles(repo);
    for (const path of paths) touchDemoWorkFile(repo, path);
    repo.mark(event);
    repo.emitChannel('tree', repo.activeRepo);
  };
  const list = (repoPath: string, parent = '') => {
    const invalid = validate(repoPath, parent, true);
    if (invalid) return { success: false as const, error: invalid };
    if (parent && !repo.directories.has(parent) && !isDemoGitlink(repo.files[parent])) return { success: false as const, error: messages.parent };
    const entries: WorkingDirectoryEntryDto[] = [
      ...[...repo.directories]
        .filter((path) => demoParent(path) === parent)
        .map((path) => ({ path, name: path.slice(parent ? parent.length + 1 : 0), kind: 'directory' as const })),
      ...Object.entries(repo.files)
        .filter(([path]) => demoParent(path) === parent && !repo.directories.has(path))
        .map(([path, blob]) => ({
          path,
          name: path.slice(parent ? parent.length + 1 : 0),
          kind: isDemoGitlink(blob) ? ('directory' as const) : ('file' as const),
          ...(isDemoGitlink(blob) ? {} : { bytes: demoBlobBytes(blob).length }),
        })),
    ];
    entries.sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name, 'en'));
    return { success: true as const, data: entries };
  };
  const create = (path: string, repoPath: string, directory: boolean): WorkingDirectoryMutationResultDto => {
    const invalid = validate(repoPath, path);
    if (invalid) return error(invalid);
    if (protectsSubmodule(path)) return error(moduleMessage);
    if (collisionAt(repo, path)) return error(messages.exists);
    const parent = demoParent(path);
    if (parent && !repo.directories.has(parent)) return error(messages.parent);
    if (directory) repo.directories.add(path);
    else put(repo.files, path, '');
    publish(directory ? [] : [path], directory ? 'folder-created' : 'file-created');
    return { success: true, targetPath: path };
  };
  const transfer = (source: string, target: string, overwrite: boolean, repoPath: string, move: boolean): WorkingDirectoryMutationResultDto => {
    const invalid = transferError(source, target, repoPath);
    if (invalid) return error(invalid);
    const kind = kindAt(repo, source);
    if (!kind) return error(messages.missing);
    if (source === target) return move ? { success: true, targetPath: target } : error(messages.exists);
    if (kind === 'directory' && demoDescendant(target.toLowerCase(), source.toLowerCase()) && source.toLowerCase() !== target.toLowerCase())
      return error(messages.nested);
    const parent = demoParent(target);
    if (parent && !repo.directories.has(parent)) return error(messages.parent);
    const collision = collisionAt(repo, target);
    const caseRename = move && collision === source && source.toLowerCase() === target.toLowerCase();
    if (collision && !caseRename && !overwrite) return error(messages.exists);
    if (collision === source && !caseRename) return error(messages.exists);
    if (collision && kind === 'directory' && demoDescendant(source.toLowerCase(), collision.toLowerCase()) && !caseRename) return error(messages.nested);
    const sourceFiles = Object.keys(repo.files).filter((path) => path === source || (kind === 'directory' && demoDescendant(path, source)));
    const sourceDirectories = [...repo.directories].filter((path) => kind === 'directory' && demoDescendant(path, source));
    const files = structuredClone(repo.files),
      directories = new Set(repo.directories),
      affected = new Set<string>();
    if (collision && !caseRename) {
      for (const path of Object.keys(files))
        if (demoDescendant(path, collision)) {
          delete files[path];
          affected.add(path);
        }
      for (const path of directories) if (demoDescendant(path, collision)) directories.delete(path);
    }
    if (move) {
      for (const path of sourceFiles) {
        delete files[path];
        affected.add(path);
      }
      for (const path of sourceDirectories) directories.delete(path);
    }
    for (const path of sourceFiles) {
      const destination = target + path.slice(source.length);
      put(files, destination, structuredClone(repo.files[path]));
      affected.add(destination);
    }
    for (const path of sourceDirectories) directories.add(target + path.slice(source.length));
    if (kind === 'directory') directories.add(target);
    repo.files = files;
    repo.directories = directories;
    publish(affected, move ? 'entry-moved' : 'entry-copied');
    return { success: true, targetPath: target };
  };
  return {
    listWorkingDirectory: async (repoPath, parent) => list(repoPath, parent),
    listWorkingDirectoryFolders: async (repoPath, parent) => {
      const result = list(repoPath, parent);
      return result.success ? { success: true, data: result.data.filter((entry) => entry.kind === 'directory').map((entry) => entry.path) } : result;
    },
    createWorkingDirectoryFile: async (path, repoPath) => create(path, repoPath, false),
    createWorkingDirectoryFolder: async (path, repoPath) => create(path, repoPath, true),
    copyWorkingDirectoryEntry: async (source, target, overwrite, repoPath) => transfer(source, target, overwrite, repoPath, false),
    moveWorkingDirectoryEntry: async (source, target, overwrite, repoPath) => transfer(source, target, overwrite, repoPath, true),
    deleteWorkingDirectoryEntry: async (path, repoPath) => {
      const invalid = validate(repoPath, path);
      if (invalid) return error(invalid);
      if (protectsSubmodule(path)) return error(moduleMessage);
      if (!kindAt(repo, path)) return error(messages.missing);
      const affected = Object.keys(repo.files).filter((entry) => demoDescendant(entry, path));
      for (const entry of affected) delete repo.files[entry];
      for (const entry of repo.directories) if (demoDescendant(entry, path)) repo.directories.delete(entry);
      publish(affected, 'entry-deleted');
      return { success: true };
    },
  };
}
