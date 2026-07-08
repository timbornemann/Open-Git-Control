import { GitService, gitService } from './GitService';
import { AiProvider, AppSettings } from './settings';
import { AiProviderClient, getSelectedAiModel } from './ai/AiProviderClient';
import { AiAutoCommitRunner } from './ai/AiAutoCommitRunner';
import {
  buildFallbackCommitMessage,
  generateCommitMessageFromUserNotes as generateCommitMessageFromUserNotesCore,
} from './ai/commitMessageGenerator';
import { generateReleaseNotes as generateReleaseNotesCore } from './ai/releaseNotesGenerator';
import type {
  AiAutoCommitResult,
  AiProgressUpdate,
  CommitMessage,
  ReleaseCommitInput,
  ReleaseVersionBump,
} from './ai/aiServiceTypes';

export type {
  AiAutoCommitResult,
  AiProgressUpdate,
  CommitMessage,
  ReleaseCommitInput,
  ReleaseVersionBump,
} from './ai/aiServiceTypes';

export { buildFallbackCommitMessage };
export { parseStatusPorcelain } from './ai/gitStatusSnapshot';
export { buildStructuredDiffContext } from './ai/diffContext';

const aiProviderClient = new AiProviderClient();

const assertGenerationConfigured = (settings: AppSettings, getGeminiApiKey: () => string) => {
  const model = getSelectedAiModel(settings);
  if (!model) {
    throw new Error('Kein KI-Modell konfiguriert.');
  }

  if (settings.aiProvider === 'gemini') {
    const apiKey = getGeminiApiKey().trim();
    if (!apiKey) {
      throw new Error('Gemini API key fehlt.');
    }
  }
};

export class AiService {
  private readonly autoCommitRunner: AiAutoCommitRunner;

  constructor(
    private readonly gitService: GitService,
    private readonly providerClient: AiProviderClient = aiProviderClient,
  ) {
    this.autoCommitRunner = new AiAutoCommitRunner(gitService, providerClient);
  }

  async testConnection(settings: AppSettings, getGeminiApiKey: () => string): Promise<{ ok: true; provider: AiProvider; model: string; detail: string }> {
    return this.providerClient.testConnection(settings, getGeminiApiKey);
  }

  async listModels(settings: AppSettings, getGeminiApiKey: () => string): Promise<string[]> {
    return this.providerClient.listModels(settings, getGeminiApiKey);
  }

  async generateCommitMessageFromUserNotes(
    settings: AppSettings,
    getGeminiApiKey: () => string,
    params: { notes: string },
  ): Promise<CommitMessage> {
    assertGenerationConfigured(settings, getGeminiApiKey);
    return generateCommitMessageFromUserNotesCore(this.providerClient, settings, getGeminiApiKey, params);
  }

  async generateReleaseNotes(
    settings: AppSettings,
    getGeminiApiKey: () => string,
    params: {
      tagName: string;
      releaseName: string;
      lastReleaseTag?: string | null;
      commits: ReleaseCommitInput[];
      repositoryHtmlUrl?: string | null;
      language: 'de' | 'en';
      versionBump: ReleaseVersionBump;
      hints?: string[];
    },
  ): Promise<string> {
    return generateReleaseNotesCore(this.providerClient, settings, getGeminiApiKey, params);
  }

  async runAutoCommit(
    settings: AppSettings,
    getGeminiApiKey: () => string,
    onProgress?: (update: AiProgressUpdate) => void,
    shouldCancel?: () => boolean,
  ): Promise<AiAutoCommitResult> {
    return this.autoCommitRunner.run(settings, getGeminiApiKey, onProgress, shouldCancel);
  }
}

export const aiService = new AiService(gitService);
