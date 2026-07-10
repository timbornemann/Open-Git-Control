import type { GitService } from '../GitService';
import type { AppSettings } from '../settings';
import type { AiProviderClient } from './AiProviderClient';
import { AiAutoCommitRunSession } from './AiAutoCommitRunSession';
import type { AiAutoCommitResult, AiProgressUpdate } from './aiServiceTypes';

export class AiAutoCommitRunner {
  constructor(
    private readonly gitService: GitService,
    private readonly providerClient: AiProviderClient,
  ) {}

  async run(
    repoPath: string,
    settings: AppSettings,
    getGeminiApiKey: () => string,
    onProgress?: (update: AiProgressUpdate) => void,
    shouldCancel?: () => boolean,
  ): Promise<AiAutoCommitResult> {
    return new AiAutoCommitRunSession(this.gitService, this.providerClient, repoPath, settings, getGeminiApiKey, onProgress, shouldCancel).run();
  }
}
