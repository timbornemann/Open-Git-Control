import { OpenGitControlAssetWatcher, type WatchDirectory } from './OpenGitControlAssetWatcher';

const CONFIG_FILE = 'run.json';

/** Watches `run.json` of exactly one active repository. */
export class RepositoryRunConfigWatcher extends OpenGitControlAssetWatcher {
  constructor(onChanged: (repositoryPath: string) => void, changeDebounceMs?: number, createWatcher?: WatchDirectory) {
    super(CONFIG_FILE, onChanged, changeDebounceMs, createWatcher);
  }
}
