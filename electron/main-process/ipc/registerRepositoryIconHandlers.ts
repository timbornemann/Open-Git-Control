import { app, dialog, ipcMain, nativeImage, type WebContents } from 'electron';
import * as path from 'node:path';
import { RepositoryIconService } from '../RepositoryIconService';
import { onRepoStoreChanged, readStoreData } from '../repoStore';
import { repositoryPathKey } from '../activeRepositoryAuthorization';
import { resolveExistingRepositoryPathWithoutSymlinks } from '../../git/RepositoryPathSafety';
import { IpcChannel } from '../../../src/types/ipcContract';
import { REPOSITORY_ICON_MAX_PNG_BYTES, REPOSITORY_ICON_SIZE } from '../../../src/shared/repositoryIcons';
import type { IpcResult } from '../../../src/types/ipc';

export function validateRepositoryIconPng(dataUrl: string): string {
  if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(dataUrl) || dataUrl.length > REPOSITORY_ICON_MAX_PNG_BYTES * 1.4)
    throw new Error('Invalid repository logo preview.');
  const buffer = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  if (buffer.length > REPOSITORY_ICON_MAX_PNG_BYTES || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error('Invalid PNG preview.');
  if (buffer.length < 24 || buffer.readUInt32BE(16) !== REPOSITORY_ICON_SIZE || buffer.readUInt32BE(20) !== REPOSITORY_ICON_SIZE)
    throw new Error('Invalid PNG preview dimensions.');
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) throw new Error('Invalid PNG preview.');
  return `data:image/png;base64,${image.toPNG().toString('base64')}`;
}
export function registerRepositoryIconHandlers(
  service = new RepositoryIconService({
    directory: path.join(app.getPath('userData'), 'repository-icons'),
    storedPaths: () => readStoreData().repos.map((repo) => repo.path),
    validatePng: validateRepositoryIconPng,
  }),
) {
  const senders = new Map<number, WebContents>();
  service.subscribe((state) => {
    for (const sender of senders.values()) if (!sender.isDestroyed()) sender.send(IpcChannel.RepositoryIconChanged, state);
  });
  const saved = (repo: string) => {
    if (typeof repo !== 'string' || !repo.trim() || !path.isAbsolute(repo)) throw new Error('An absolute saved repository path is required.');
    const registered = readStoreData().repos.find((entry) => repositoryPathKey(entry.path) === repositoryPathKey(String(repo || '')));
    if (!registered) throw new Error('Repository logos are only available for saved repositories.');
    return registered.path;
  };
  const handle = (channel: IpcChannel, operation: (repo: string, input: any) => Promise<unknown>) => {
    ipcMain.handle(channel, async (event, repo: string, input: unknown): Promise<IpcResult<unknown>> => {
      try {
        const registered = saved(repo);
        if (!senders.has(event.sender.id)) {
          senders.set(event.sender.id, event.sender);
          event.sender.once('destroyed', () => senders.delete(event.sender.id));
        }
        return { success: true, data: await operation(registered, input) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
  };
  handle(IpcChannel.RepositoryIconGet, (repo, rescan) => service.get(repo, rescan === true));
  handle(IpcChannel.RepositoryIconSource, (repo, relativePath) => service.readSource(repo, relativePath));
  handle(IpcChannel.RepositoryIconChoice, (repo, choice) => service.choose(repo, choice));
  handle(IpcChannel.RepositoryIconCache, (repo, request) => service.cache(repo, request));
  handle(IpcChannel.RepositoryIconSelectFile, async (repo) => {
    const result = await dialog.showOpenDialog({
      defaultPath: repo,
      properties: ['openFile'],
      filters: [{ name: 'Repository images', extensions: ['png', 'apng', 'svg', 'ico', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    saved(repo);
    const relative = path.relative(repo, result.filePaths[0]);
    resolveExistingRepositoryPathWithoutSymlinks(repo, relative);
    const normalized = relative.split(path.sep).join('/');
    await service.readSource(repo, normalized);
    return normalized;
  });
  const retain = () => service.retainRepositories(readStoreData().repos.map((repo) => repo.path));
  onRepoStoreChanged(retain);
  retain();
  return service;
}
